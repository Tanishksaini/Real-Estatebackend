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
      "Nodemailer/Gmail is not configured. Set EMAIL_USER and EMAIL_PASS in your .env file."
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });

  const mailOptions = {
    from: `"Real Estate Property App" <${cfg.user}>`,
    to: email,
    subject: "Password Reset OTP - Property App",
    text: `Your password reset OTP is ${otp}. Valid for 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Reset Your Password</h2>
        <p>Dear User,</p>
        <p>You requested to reset your password. Please use the following One-Time Password (OTP) to complete the reset process. This OTP is valid for 10 minutes.</p>
        <div style="background-color: #f9f9f9; border: 1px dashed #ccc; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #4F46E5; margin: 20px 0;">
          ${otp}
        </div>
        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #777; text-align: center;">This is an automated email. Please do not reply.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendPasswordResetOtp, getNodemailerConfig };
