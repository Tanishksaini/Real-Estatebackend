const nodemailer = require("nodemailer");

function getNodemailerConfig() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  return { user, pass };
}

async function sendPasswordResetOtp(email, otp) {
  const cfg = getNodemailerConfig();

  if (!cfg) {
    throw new Error(
      "EMAIL_USER and EMAIL_PASS are not configured."
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      rejectUnauthorized: false,
      family: 4,
    },
  });

  await transporter.verify();

  const mailOptions = {
    from: `"Real Estate Property App" <${cfg.user}>`,
    to: email,
    subject: "Password Reset OTP - Property App",
    text: `Your password reset OTP is ${otp}. Valid for 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>Valid for 10 minutes.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);

  console.log("Email sent:", info.messageId);

  return info;
}

module.exports = {
  sendPasswordResetOtp,
  getNodemailerConfig,
};