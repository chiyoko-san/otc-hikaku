'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function ContactForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    type: 'other',
    body: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.email.trim() || !form.body.trim()) {
      setError('メールアドレスと本文は必須です。');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: err } = await supabase.from('contact_messages').insert({
      name: form.name.trim() || null,
      email: form.email.trim(),
      type: form.type,
      body: form.body.trim(),
    });
    if (err) {
      setError('送信に失敗しました。時間をおいてやり直してください。');
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center">
        <div className="mb-2 text-3xl">✓</div>
        <h2 className="mb-2 text-xl font-bold">お問い合わせを受け付けました</h2>
        <p className="text-sm text-gray-700">内容を確認次第、ご連絡いたします。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <div>
        <label className="mb-1 block text-sm font-bold">お名前(任意)</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold">
          メールアドレス <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold">お問い合わせ種別</label>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2"
        >
          <option value="feedback">ご意見・ご要望</option>
          <option value="correction">掲載情報の訂正依頼</option>
          <option value="takedown">掲載削除の依頼</option>
          <option value="business">取材・業務連絡</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold">
          お問い合わせ内容 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={8}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </div>
      <button
        onClick={submit}
        disabled={submitting}
        className="btn-primary w-full"
      >
        {submitting ? '送信中…' : '送信する'}
      </button>
    </div>
  );
}
