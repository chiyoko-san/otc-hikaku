var MEDS=__MEDS__;
var ING=__ING__;
var COLS=__COLS__;
var SYMS=__SYMS__;
var CATS=__CATS__;
var RLBL={0:"要指導",1:"第1類",2:"第2類（指定）",2.5:"第２類",3:"第3類"};
var RCLS={0:"r0",1:"r1",2:"r2",2.5:"r25",3:"r3"};
var S={cat:"all",q:"",ings:[],syms:[],risk:"",sort:"def",nd:false,nw:false,pg:1,pp:20};
var CMP=[];

/* ── URLパラメータ制御 ── */
function getParam(key){
  var p=new URLSearchParams(window.location.search);
  return p.get(key)||"";
}
function setParam(key,val){
  var p=new URLSearchParams(window.location.search);
  if(val)p.set(key,val);else p.delete(key);
  var url=window.location.pathname+(p.toString()?"?"+p.toString():"");
  history.pushState({},"",url);
}
function clearParam(key){setParam(key,"");}

/* ── ページ切替 ── */
function showPg(id){
  document.querySelectorAll(".pg").forEach(function(p){p.classList.remove("on");});
  document.querySelectorAll(".ntab").forEach(function(t){t.classList.remove("on");});
  document.getElementById("pg-"+id).classList.add("on");
  document.getElementById("t-"+id).classList.add("on");
  if(id==="guide")buildGuide();
  if(id==="column")buildCols();
}

/* ── アコーディオン ── */
function togAcc(k){
  var hd=document.getElementById("hd-"+k);
  var bd=document.getElementById("bd-"+k);
  hd.classList.toggle("open");
  bd.classList.toggle("open");
}

/* ── カテゴリ ── */
function buildCats(){
  var el=document.getElementById("catlist");
  CATS.forEach(function(c){
    var cnt=c.id==="all"?MEDS.length:MEDS.filter(function(m){return m.cat===c.id;}).length;
    if(cnt===0&&c.id!=="all")return;
    var b=document.createElement("button");
    b.type="button";b.className="cbtn"+(c.id==="all"?" on":"");b.dataset.cat=c.id;
    b.innerHTML='<span class="ci">'+c.i+'</span>'+c.l+'<span class="ck">'+cnt+'</span>';
    b.addEventListener("click",function(){
      document.querySelectorAll(".cbtn").forEach(function(x){x.classList.remove("on");});
      b.classList.add("on");S.cat=c.id;S.pg=1;render();updCnts();
    });
    el.appendChild(b);
  });
}
buildCats();

/* ── 症状 ── */
function buildSymp(){
  var el=document.getElementById("symarea");el.innerHTML="";
  SYMS.forEach(function(grp){
    var div=document.createElement("div");div.className="sg";
    var h=document.createElement("div");h.className="sgh";
    h.innerHTML="<span>"+grp.i+"</span>"+grp.g+'<span class="gar">▼</span>';
    var t=document.createElement("div");t.className="stags hide";
    grp.s.forEach(function(sym){
      var cnt=MEDS.filter(function(m){return m.symptoms&&m.symptoms.indexOf(sym)>-1;}).length;
      if(!cnt)return;
      var sp=document.createElement("span");
      sp.className="stag"+(S.syms.indexOf(sym)>-1?" on":"");
      sp.innerHTML=sym+'<span style="opacity:.5;font-size:9px;margin-left:2px">'+cnt+'</span>';
      sp.addEventListener("click",function(){
        var idx=S.syms.indexOf(sym);
        if(idx>-1)S.syms.splice(idx,1);else S.syms.push(sym);
        sp.classList.toggle("on");S.pg=1;render();updCnts();
      });
      t.appendChild(sp);
    });
    h.addEventListener("click",function(){h.classList.toggle("col");t.classList.toggle("hide");});
    div.appendChild(h);div.appendChild(t);el.appendChild(div);
  });
}
buildSymp();

/* ── 成分チップ ── */
function buildIngs(){
  var map={};
  MEDS.forEach(function(m){
    (m.ings||[]).forEach(function(ing){
      var k=ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim();
      if(k)map[k]=(map[k]||0)+1;
    });
  });
  var sorted=Object.keys(map).sort(function(a,b){return map[b]-map[a];}).slice(0,80);
  var el=document.getElementById("ingarea");el.innerHTML="";
  sorted.forEach(function(ing){
    var c=document.createElement("span");
    c.className="ichip"+(S.ings.indexOf(ing)>-1?" on":"");
    c.textContent=ing;
    c.addEventListener("click",function(){
      var idx=S.ings.indexOf(ing);
      if(idx>-1){S.ings.splice(idx,1);c.classList.remove("on");}
      else{S.ings.push(ing);c.classList.add("on");}
      S.pg=1;render();updCnts();
    });
    el.appendChild(c);
  });
}
buildIngs();

function updCnts(){
  [["cat",S.cat!=="all"?1:0],["sym",S.syms.length],["ing",S.ings.length]].forEach(function(pair){
    var el=document.getElementById("cnt-"+pair[0]);
    if(el){el.textContent=pair[1];el.classList.toggle("on",pair[1]>0);}
  });
}

/* ── フィルタ ── */
function doFilter(){
  var r=MEDS.slice();
  if(S.cat!=="all")r=r.filter(function(m){return m.cat===S.cat;});
  if(S.q){
    var q=S.q.toLowerCase();
    r=r.filter(function(m){
      return (m.name||"").toLowerCase().indexOf(q)>-1||
             (m.maker||"").toLowerCase().indexOf(q)>-1||
             (m.effect||"").toLowerCase().indexOf(q)>-1||
             (m.ings||[]).some(function(i){return i.toLowerCase().indexOf(q)>-1;});
    });
  }
  if(S.syms.length>0)r=r.filter(function(m){return m.symptoms&&S.syms.some(function(s){return m.symptoms.indexOf(s)>-1;});});
  if(S.ings.length>0)r=r.filter(function(m){return S.ings.every(function(si){return (m.ings||[]).some(function(mi){return mi.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim().indexOf(si)>-1;});});});
  if(S.risk!==""){var rv=parseFloat(S.risk);if(rv===2)r=r.filter(function(m){return m.risk>=2&&m.risk<3;});else r=r.filter(function(m){return m.risk===rv;});}
  if(S.nd)r=r.filter(function(m){return !m.drowsy;});
  if(S.nw)r=r.filter(function(m){return !(m.warnIngs&&m.warnIngs.length);});
  if(S.sort==="pa")r.sort(function(a,b){return (a.price||999999)-(b.price||999999);});
  else if(S.sort==="pd")r.sort(function(a,b){return (b.price||0)-(a.price||0);});
  else if(S.sort==="nm")r.sort(function(a,b){return a.name.localeCompare(b.name,"ja");});
  else if(S.sort==="rk")r.sort(function(a,b){return (a.risk||9)-(b.risk||9);});
  return r;
}

/* ── カード ── */
function getCat(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i];return{i:"",l:id};}

function mkCard(m){
  var cat=getCat(m.cat);
  var wset={};(m.warnIngs||[]).forEach(function(w){wset[w.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});
  var iH=(m.ings||[]).map(function(ing){
    var b=ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim();
    var cls=wset[b]?"iw":S.ings.indexOf(b)>-1?"im":"in";
    var title=ING[b]?ING[b].substring(0,80):"";
    return '<span class="itag '+cls+'"'+(title?' title="'+title+'"':'')+'>'+ing+'</span>';
  }).join("");
  var sH="";
  if(m.symptoms&&m.symptoms.length){
    sH='<div class="csymp">'+m.symptoms.map(function(s){return '<span class="sym'+(S.syms.indexOf(s)>-1?" hit":"")+'">'+s+"</span>";}).join("")+"</div>";
  }
  var nc=m.noteType==="danger"?"nd":m.noteType==="warn"?"nw":"nn";
  var pr=m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div><div class="cpnote">参考価格（税込）</div>':'<div class="cpval np">価格要確認</div>';
  var sel=CMP.indexOf(m.id)>-1;
  var detUrl="?med="+encodeURIComponent(m.name);
  return '<div class="card" id="cd-'+m.id+'">'
    +'<div class="csel"><input type="checkbox"'+(sel?" checked":"")
    +' onchange="togCmp('+m.id+',this.checked)"></div>'
    +'<div class="chard"><div><div class="cname">'+m.name+'</div><div class="cmaker">'+(m.maker||"")+'</div></div>'
    +'<div class="cprice">'+pr+'</div></div>'
    +'<div class="badges"><span class="badge bc">'+cat.i+" "+cat.l+'</span>'
    +'<span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span>'
    +(m.drowsy?'<span class="badge bd2">🌙 眠気注意</span>':"")
    +((m.warnIngs&&m.warnIngs.length)?'<span class="badge bw2">⚠ 要注意成分</span>':"")
    +"</div>"+sH
    +'<div class="cef">'+(m.effect||"")+"</div>"
    +'<div class="ings">'+iH+"</div>"
    +(m.note?'<div class="note '+nc+'">'+m.note+"</div>":"")
    +'<div class="cfoot"><span class="cfootl">成分数:'+(m.ings||[]).length+'</span>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<button type="button" class="simbtn" onclick="showSim('+m.id+')">類似商品</button>'
    +'<a href="'+detUrl+'" class="detaillink">📋 詳細・共有</a>'
    +"</div></div>"
    +'<div id="sim-'+m.id+'" style="display:none"></div>'
    +"</div>";
}

/* ── 詳細ページ ── */
function showDetail(name){
  var m=null;
  for(var i=0;i<MEDS.length;i++){if(MEDS[i].name===name){m=MEDS[i];break;}}
  if(!m){render();return;}

  var cat=getCat(m.cat);
  var detUrl=window.location.origin+window.location.pathname+"?med="+encodeURIComponent(m.name);

  // 有効成分テーブル
  var ingRows=(m.ings||[]).map(function(ing){
    var b=ing.replace(/[(（][^)）]*/g,"").replace(/[)） ]/g,"").trim();
    var amt=ing.match(/[(（]([^)）]+)[)）]/);amtStr=amt?amt[1]:"";
    var desc=ING[b]||"";
    var isW=(m.warnIngs||[]).indexOf(b)>-1||(m.warnIngs||[]).some(function(w){return ing.indexOf(w)>-1;});
    return '<div class="det-ing-row">'
      +'<div><div class="det-ing-name">'+b+(isW?'<span class="det-ing-warn">⚠ 要注意</span>':'')+'</div>'
      +(amtStr?'<div style="font-size:11px;color:var(--teal2);font-weight:600;margin-top:1px">'+amtStr+'</div>':'')
      +(desc?'<div class="det-ing-desc">'+desc+'</div>':'')
      +"</div></div>";
  }).join("");

  var riskLabel=RLBL[m.risk]||"";
  var riskCls=RCLS[m.risk]||"r25";

  var html='<div class="detpg">'
    +'<button type="button" class="detpg-back" onclick="backFromDetail()">← 一覧に戻る</button>'
    +'<div class="detcard">'
    +'<div class="detcard-head">'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
    +'<span class="badge '+riskCls+'">'+riskLabel+'</span>'
    +(m.drowsy?'<span class="badge bd2">🌙 眠気注意</span>':"")
    +((m.warnIngs&&m.warnIngs.length)?'<span class="badge bw2">⚠ 要注意成分含有</span>':"")
    +"</div>"
    +'<h1>'+m.name+'</h1>'
    +'<div class="maker">'+(m.maker||"")+(m.price?' ｜ 参考価格 ¥'+m.price.toLocaleString():"")+'</div>'
    +"</div>"
    +'<div class="detcard-body">'

    // 効能・効果
    +'<div class="det-section">'
    +'<div class="det-section-hd">📋 効能・効果</div>'
    +'<div class="det-section-bd">'+(m.effect||"記載なし")+"</div>"
    +"</div>"

    // 有効成分・成分量
    +(ingRows?'<div class="det-section">'
    +'<div class="det-section-hd">⚗️ 有効成分・成分量</div>'
    +'<div class="det-section-bd" style="padding:0 14px">'+ingRows+"</div>"
    +"</div>":"")

    // 注意事項
    +(m.note?'<div class="det-section">'
    +'<div class="det-section-hd">⚠️ 注意事項</div>'
    +'<div class="det-section-bd note '+(m.noteType==="danger"?"nd":m.noteType==="warn"?"nw":"nn")+'" style="border-radius:0;border:none;margin:0">'+m.note+"</div>"
    +"</div>":"")

    // 症状
    +((m.symptoms&&m.symptoms.length)?'<div class="det-section">'
    +'<div class="det-section-hd">🤕 対象症状</div>'
    +'<div class="det-section-bd"><div class="csymp">'+m.symptoms.map(function(s){return '<span class="sym">'+s+"</span>";}).join("")+"</div></div>"
    +"</div>":"")

    // PMDA
    +'<div class="det-section">'
    +'<div class="det-section-hd">📄 公式情報</div>'
    +'<div class="det-section-bd"><a href="https://www.pmda.go.jp/PmdaSearch/otcSearch" target="_blank" style="color:#2563eb">PMDA 添付文書検索 ↗</a></div>'
    +"</div>"

    // 共有URL
    +'<div class="det-share">'
    +'<span>🔗 このページを共有</span>'
    +'<input type="text" readonly value="'+detUrl+'" onclick="this.select()" id="det-share-inp">'
    +'<button type="button" onclick="copyDetUrl()">コピー</button>'
    +"</div>"

    +"</div></div></div>";

  // 検索ページを詳細表示に切替
  document.getElementById("grid").style.display="none";
  document.getElementById("pagi").style.display="none";
  document.getElementById("resinfo").style.display="none";
  document.getElementById("afchips").style.display="none";
  document.querySelector(".cmpbar").style.display="none";
  document.querySelector(".sb").style.display="none";
  document.getElementById("pg-search").classList.remove("layout");

  var detEl=document.getElementById("det-container");
  if(!detEl){detEl=document.createElement("div");detEl.id="det-container";document.getElementById("pg-search").appendChild(detEl);}
  detEl.innerHTML=html;
  detEl.style.display="block";
  window.scrollTo({top:0,behavior:"smooth"});
}

function backFromDetail(){
  clearParam("med");
  document.getElementById("grid").style.display="";
  document.getElementById("pagi").style.display="";
  document.getElementById("resinfo").style.display="";
  document.getElementById("afchips").style.display="";
  document.querySelector(".cmpbar").style.display="";
  document.querySelector(".sb").style.display="";
  var detEl=document.getElementById("det-container");
  if(detEl)detEl.style.display="none";
}

function copyDetUrl(){
  var inp=document.getElementById("det-share-inp");
  if(!inp)return;
  inp.select();
  try{document.execCommand("copy");}catch(e){navigator.clipboard&&navigator.clipboard.writeText(inp.value);}
  alert("URLをコピーしました！");
}

/* ── 類似商品 ── */
function showSim(id){
  var m=null;for(var i=0;i<MEDS.length;i++){if(MEDS[i].id===id){m=MEDS[i];break;}}
  if(!m)return;
  var el=document.getElementById("sim-"+id);
  if(el.style.display==="block"){el.style.display="none";return;}
  var bi={};(m.ings||[]).forEach(function(i){bi[i.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});
  var sims=MEDS.filter(function(x){return x.id!==id&&x.cat===m.cat;}).map(function(x){
    var xi={};(x.ings||[]).forEach(function(i){xi[i.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});
    var inter=Object.keys(bi).filter(function(k){return xi[k];}).length;
    var union=Object.keys(Object.assign({},bi,xi)).length;
    return{x:x,s:union?inter/union:0};
  }).filter(function(o){return o.s>0;}).sort(function(a,b){return b.s-a.s;}).slice(0,3);
  if(!sims.length){el.innerHTML='<div style="font-size:12px;color:var(--txl);padding:6px">類似商品が見つかりません</div>';el.style.display="block";return;}
  el.innerHTML='<div class="simpnl"><h3>🔍 類似商品</h3>'
    +sims.map(function(o){
      return '<div class="simcard"><div><div style="font-size:13px;font-weight:600">'+o.x.name+'</div>'
        +'<div style="font-size:11px;color:var(--txl)">成分一致度 '+Math.round(o.s*100)+'%</div></div>'
        +'<button type="button" class="simgo" onclick="jumpTo('+o.x.id+')">詳細を見る</button></div>';
    }).join("")+"</div>";
  el.style.display="block";
}

function jumpTo(id){
  var el=document.getElementById("cd-"+id);
  if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.outline="2px solid var(--teal)";setTimeout(function(){el.style.outline="";},1500);}
}

/* ── 比較 ── */
function togCmp(id,chk){
  if(chk){
    if(CMP.length>=4){alert("最大4件まで比較できます");
      var cb=document.querySelector("#cd-"+id+" input[type=checkbox]");if(cb)cb.checked=false;return;}
    CMP.push(id);
  }else{var i=CMP.indexOf(id);if(i>-1)CMP.splice(i,1);}
  document.getElementById("cmpcnt").textContent=CMP.length;
  document.getElementById("cmpbtn").disabled=CMP.length<2;
}

function openCmp(){
  var meds=CMP.map(function(id){for(var i=0;i<MEDS.length;i++){if(MEDS[i].id===id)return MEDS[i];}return null;}).filter(Boolean);
  if(meds.length<2)return;

  // 全成分収集
  var allI={};
  meds.forEach(function(m){(m.ings||[]).forEach(function(ing){
    var k=ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim();
    allI[k]=ing; // 元の文字列（成分量含む）も保持
  });});
  var ingKeys=Object.keys(allI).filter(Boolean);

  var hd=meds.map(function(m){
    return '<th class="'+(RCLS[m.risk]||"r25")+'" style="min-width:120px">'
      +'<div style="font-weight:700;font-size:13px">'+m.name+'</div>'
      +'<div style="font-size:10px;font-weight:400;color:var(--txm)">'+(m.maker||"")+'</div>'
      +'<div style="font-size:10px;margin-top:2px">'+(RLBL[m.risk]||"")+'</div>'
      +'<a href="?med='+encodeURIComponent(m.name)+'" style="font-size:10px;color:#2563eb">詳細 ↗</a>'
      +"</th>";
  }).join("");

  // 価格・眠気・要注意
  var prRow="<tr><th>💰 価格</th>"+meds.map(function(m){return "<td>"+(m.price?"¥"+m.price.toLocaleString():"不明")+"</td>";}).join("")+"</tr>";
  var drRow="<tr><th>🌙 眠気</th>"+meds.map(function(m){return "<td>"+(m.drowsy?"あり":"なし")+"</td>";}).join("")+"</tr>";
  var wnRow="<tr><th>⚠ 要注意</th>"+meds.map(function(m){return "<td>"+((m.warnIngs&&m.warnIngs.length)?"あり":"なし")+"</td>";}).join("")+"</tr>";

  // 効能効果
  var efRow="<tr><th>📋 効能・効果</th>"+meds.map(function(m){
    return '<td style="font-size:11px;line-height:1.6">'+(m.effect||"―")+"</td>";
  }).join("")+"</tr>";

  // 成分ごとの行（成分量付き）
  var ingRows=ingKeys.map(function(k){
    var desc=ING[k]?"<br><span style='font-size:10px;color:var(--txl)'>"+ING[k].substring(0,50)+"</span>":"";
    var cells=meds.map(function(m){
      var found=null;
      (m.ings||[]).forEach(function(ing){
        if(ing.replace(/[(（][^)） ]*/g,"").replace(/[)）]/g,"").trim()===k)found=ing;
      });
      if(!found)return '<td style="text-align:center;color:var(--txl)">―</td>';
      var amt=found.match(/[(（]([^)）]+)[)）]/);
      return '<td style="text-align:center"><span class="ck2">✓</span>'+(amt?'<br><span style="font-size:11px;color:var(--teal2);font-weight:600">'+amt[1]+'</span>':"")+"</td>";
    }).join("");
    return "<tr><th>"+k+desc+"</th>"+cells+"</tr>";
  }).join("");

  // 共有URL
  var shareUrl=window.location.origin+window.location.pathname+"?compare="+meds.map(function(m){return encodeURIComponent(m.name);}).join(",");

  document.getElementById("cmpbody").innerHTML=
    '<table class="cmptbl"><thead><tr><th>項目 / 商品</th>'+hd+'</tr></thead>'
    +'<tbody>'+prRow+drRow+wnRow+efRow
    +'<tr><th colspan="'+(meds.length+1)+'" style="background:#f1f5f9;font-size:10px;color:var(--txl);text-align:center">── 有効成分・成分量 ──</th></tr>'
    +ingRows+"</tbody></table>"
    +'<div class="sharerow">'
    +'<span style="font-size:12px;font-weight:600;color:var(--teal2);white-space:nowrap">🔗 比較表を共有</span>'
    +'<input class="shareinp" id="cmp-share-inp" type="text" readonly value="'+shareUrl+'" onclick="this.select()">'
    +'<button type="button" class="sharebtn" onclick="copyCmpUrl()">コピー</button>'
    +"</div>";

  document.getElementById("cmpmodal").classList.remove("hide");
}

function copyCmpUrl(){
  var inp=document.getElementById("cmp-share-inp");if(!inp)return;
  inp.select();
  try{document.execCommand("copy");}catch(e){navigator.clipboard&&navigator.clipboard.writeText(inp.value);}
  alert("比較URLをコピーしました！");
}

function closeCmp(){document.getElementById("cmpmodal").classList.add("hide");}

/* ── アクティブフィルタチップ ── */
function buildAfChips(){
  var el=document.getElementById("afchips");el.innerHTML="";
  function add(lb,fn){
    var s=document.createElement("span");s.className="afc";
    s.innerHTML=lb+' <button type="button">×</button>';
    s.querySelector("button").onclick=fn;el.appendChild(s);
  }
  if(S.cat!=="all"){var c=getCat(S.cat);add(c.l,function(){S.cat="all";document.querySelectorAll(".cbtn").forEach(function(b){b.classList.remove("on");});document.querySelector('[data-cat="all"]').classList.add("on");S.pg=1;render();updCnts();});}
  if(S.q)add('"'+S.q+'"',function(){S.q="";document.getElementById("qinp").value="";S.pg=1;render();});
  S.syms.forEach(function(sym){(function(s){add("🤕 "+s,function(){var i=S.syms.indexOf(s);if(i>-1)S.syms.splice(i,1);buildSymp();S.pg=1;render();updCnts();});})(sym);});
  S.ings.forEach(function(ing){(function(v){add(v,function(){var i=S.ings.indexOf(v);if(i>-1)S.ings.splice(i,1);buildIngs();S.pg=1;render();updCnts();});})(ing);});
  if(S.risk){add(RLBL[parseFloat(S.risk)]||S.risk,function(){S.risk="";document.getElementById("frisk").value="";S.pg=1;render();});}
  if(S.nd)add("眠気なし",function(){S.nd=false;document.getElementById("cnd").checked=false;S.pg=1;render();});
  if(S.nw)add("要注意成分なし",function(){S.nw=false;document.getElementById("cnw").checked=false;S.pg=1;render();});
}

/* ── ページネーション ── */
function buildPagi(total){
  var pages=Math.ceil(total/S.pp);
  var el=document.getElementById("pagi");el.innerHTML="";
  if(pages<=1)return;
  function mk(lb,pg,dis,act){
    var b=document.createElement("button");b.type="button";
    b.className="pgb"+(act?" on":"");b.textContent=lb;
    if(dis)b.disabled=true;
    else b.onclick=function(){S.pg=pg;render();window.scrollTo({top:0,behavior:"smooth"});};
    return b;
  }
  el.appendChild(mk("‹",S.pg-1,S.pg===1,false));
  var prev=0;
  for(var i=1;i<=pages;i++){
    if(i===1||i===pages||(i>=S.pg-2&&i<=S.pg+2)){
      if(prev&&i-prev>1){var d=document.createElement("span");d.style.padding="0 4px";d.style.color="var(--txl)";d.textContent="…";el.appendChild(d);}
      el.appendChild(mk(i,i,false,i===S.pg));prev=i;
    }
  }
  el.appendChild(mk("›",S.pg+1,S.pg===pages,false));
}

/* ── メインレンダリング ── */
function render(){
  var fl=doFilter();var total=fl.length;
  document.getElementById("resinfo").innerHTML='<strong>'+total.toLocaleString()+'件</strong>表示中（全'+MEDS.length.toLocaleString()+'件）';
  buildAfChips();
  var start=(S.pg-1)*S.pp;
  document.getElementById("grid").innerHTML=fl.slice(start,start+S.pp).length===0
    ?'<div class="nores">🔍 条件に合う医薬品が見つかりません</div>'
    :fl.slice(start,start+S.pp).map(mkCard).join("");
  buildPagi(total);
}

/* ── イベント ── */
var qt;
document.getElementById("qinp").addEventListener("input",function(e){clearTimeout(qt);qt=setTimeout(function(){S.q=e.target.value.trim();S.pg=1;render();},200);});
document.getElementById("frisk").addEventListener("change",function(e){S.risk=e.target.value;S.pg=1;render();});
document.getElementById("fsort").addEventListener("change",function(e){S.sort=e.target.value;S.pg=1;render();});
document.getElementById("cnd").addEventListener("change",function(e){S.nd=e.target.checked;S.pg=1;render();});
document.getElementById("cnw").addEventListener("change",function(e){S.nw=e.target.checked;S.pg=1;render();});
document.getElementById("rbtn").addEventListener("click",function(){
  S.cat="all";S.q="";S.ings=[];S.syms=[];S.risk="";S.sort="def";S.nd=false;S.nw=false;S.pg=1;
  document.getElementById("qinp").value="";document.getElementById("frisk").value="";
  document.getElementById("fsort").value="def";document.getElementById("cnd").checked=false;document.getElementById("cnw").checked=false;
  document.querySelectorAll(".cbtn").forEach(function(b){b.classList.remove("on");});
  document.querySelector('[data-cat="all"]').classList.add("on");
  buildIngs();buildSymp();updCnts();render();
});
document.getElementById("cmpmodal").addEventListener("click",function(e){if(e.target===this)closeCmp();});

/* ── 症状ガイド ── */
function buildGuide(){
  var el=document.getElementById("ggrid");
  if(el.children.length)return;
  SYMS.forEach(function(g){
    var div=document.createElement("div");div.className="gcard";
    div.innerHTML='<div class="gico">'+g.i+'</div><div class="gname">'+g.g+'</div><div class="gsub">'+g.s.slice(0,3).join(" / ")+"…</div>";
    (function(name){div.addEventListener("click",function(){filterGuide(name);});})(g.g);
    el.appendChild(div);
  });
}

function filterGuide(name){
  var grp=null;for(var i=0;i<SYMS.length;i++){if(SYMS[i].g===name){grp=SYMS[i];break;}}
  if(!grp)return;
  setParam("guide",encodeURIComponent(name));
  var meds=MEDS.filter(function(m){return m.symptoms&&grp.s.some(function(s){return m.symptoms.indexOf(s)>-1;});});
  document.getElementById("gresult").innerHTML='<div style="margin-top:16px">'
    +'<div class="ptitle" style="font-size:15px">'+grp.i+" "+name+"（"+meds.length+"件）</div>"
    +'<div class="grid" style="margin-top:10px">'+meds.slice(0,20).map(function(m){
      var cat=getCat(m.cat);
      return '<div class="card">'
        +'<div class="chard"><div><div class="cname">'+m.name+'</div><div class="cmaker">'+(m.maker||"")+'</div></div>'
        +'<div class="cprice">'+(m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div>':'<div class="cpval np">価格要確認</div>')+'</div></div>'
        +'<div class="badges"><span class="badge bc">'+cat.i+" "+cat.l+'</span><span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span></div>'
        +'<div class="cef">'+(m.effect||"")+"</div>"
        +'<div class="cfoot" style="padding-top:7px;border-top:1px solid var(--bd)">'
        +'<a href="?med='+encodeURIComponent(m.name)+'" class="detaillink">📋 詳細・共有</a>'
        +"</div></div>";
    }).join("")+"</div>"
    +(meds.length>20?'<p style="font-size:12px;color:var(--txl);margin-top:8px">他'+(meds.length-20)+'件は検索ページで症状を選択してください。</p>':"")
    +"</div>";
}

/* ── コラム ── */
function buildCols(){
  var el=document.getElementById("cgrid");
  if(el.children.length)return;
  COLS.forEach(function(col){
    var div=document.createElement("div");div.className="ccard";
    div.innerHTML='<div class="ctop"><div class="ctag">'+col.tag+'</div><div class="ctitle">'+col.title+'</div></div>'
      +'<div class="cbdy"><div class="cdate">'+col.date+'</div><div class="csum">'+col.summary+'</div></div>';
    (function(id){div.addEventListener("click",function(){showCol(id);});})(col.id);
    el.appendChild(div);
  });
}

function showCol(id){
  var col=null;for(var i=0;i<COLS.length;i++){if(COLS[i].id===id){col=COLS[i];break;}}
  if(!col)return;
  setParam("col",id);
  document.getElementById("clist").style.display="none";
  var body=col.body.split("\n").map(function(p){
    if(!p.trim())return"";
    p=p.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
    return"<p>"+p+"</p>";
  }).join("");
  document.getElementById("cdetail").innerHTML=
    '<button type="button" class="bkbtn" onclick="backCol()">← コラム一覧に戻る</button>'
    +'<div class="cdetail"><h1>'+col.title+'</h1>'
    +'<div class="cmeta">'+col.date+" | "+col.tag+'</div>'
    +'<div class="cbody">'+body+'</div></div>';
  document.getElementById("cdetail").style.display="block";
}

function backCol(){
  clearParam("col");
  document.getElementById("clist").style.display="block";
  document.getElementById("cdetail").style.display="none";
}

/* ── 初期化（URLパラメータ対応） ── */
(function init(){
  var medName=getParam("med");
  var cmpNames=getParam("compare");
  var colId=getParam("col");
  var guideName=getParam("guide");

  if(colId){
    showPg("column");
    buildCols();
    showCol(colId);
  } else if(guideName){
    showPg("guide");
    buildGuide();
    filterGuide(decodeURIComponent(guideName));
  } else if(medName){
    // 詳細ページ
    render();
    showDetail(decodeURIComponent(medName));
  } else if(cmpNames){
    // 比較ページ
    render();
    var names=cmpNames.split(",").map(function(n){return decodeURIComponent(n);});
    names.forEach(function(name){
      for(var i=0;i<MEDS.length;i++){
        if(MEDS[i].name===name&&CMP.length<4){CMP.push(MEDS[i].id);break;}
      }
    });
    document.getElementById("cmpcnt").textContent=CMP.length;
    document.getElementById("cmpbtn").disabled=CMP.length<2;
    if(CMP.length>=2)openCmp();
  } else {
    render();
  }

  // ブラウザの戻るボタン対応
  window.addEventListener("popstate",function(){
    var mn=getParam("med");
    var cn=getParam("col");
    var gn=getParam("guide");
    if(mn){showDetail(decodeURIComponent(mn));}
    else if(cn){showPg("column");buildCols();showCol(cn);}
    else if(gn){showPg("guide");buildGuide();filterGuide(decodeURIComponent(gn));}
    else{backFromDetail();}
  });
})();
