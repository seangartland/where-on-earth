export function createSender(env) {
  if (env.EMAIL_SENDER === 'resend' && env.RESEND_API_KEY) {
    return {
      name: 'resend',
      async send({ email, otp }) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM || 'Where on Earth <accounts@where-on.earth>',
            to: [email],
            subject: 'Your Where on Earth sign-in code',
            text: `Your Where on Earth sign-in code is ${otp}. It expires in 10 minutes.`,
          }),
        });
        if (!response.ok) throw new Error(`Resend returned ${response.status}`);
      },
    };
  }

  return {
    name: 'sink',
    async send({ email, otp, type }) {
      await env.DB.prepare(
        'INSERT INTO mail_sink (id, email, otp, type, created_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(crypto.randomUUID(), email, otp, type, Date.now()).run();
    },
  };
}
