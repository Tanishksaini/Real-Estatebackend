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

  const currentYear = new Date().getFullYear();

  const mailOptions = {
    from: `"DealVeel Properties" <${cfg.user}>`,
    to: email,
    subject: "Password Reset OTP - DealVeel Properties",
    text: `Your password reset OTP is ${otp}. Valid for 10 minutes.`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 45px 20px; text-align: center; margin: 0;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border-collapse: collapse;">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 35px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">DealVeel</h1>
              <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Properties</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 35px; color: #334155; text-align: left; line-height: 1.6;">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 600; margin-bottom: 20px;">Reset Your Password</h2>
              <p style="font-size: 15px; color: #475569; margin-bottom: 25px;">
                We received a request to reset your password. Use the following verification code (OTP) to complete the process. This code is valid for <strong>10 minutes</strong>.
              </p>
              
              <div style="text-align: center; margin: 30px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb;">${otp}</span>
              </div>
              
              <p style="font-size: 13px; color: #64748b; margin-top: 25px; margin-bottom: 0;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 35px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0;">&copy; ${currentYear} DealVeel. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("Password reset OTP email sent:", info.messageId);
  return info;
}

async function sendEmailVerificationOtp(email, otp) {
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

  const currentYear = new Date().getFullYear();

  const mailOptions = {
    from: `"DealVeel Properties" <${cfg.user}>`,
    to: email,
    subject: "Verify Your Email - DealVeel Properties",
    text: `Your email verification OTP is ${otp}. Valid for 15 minutes.`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 45px 20px; text-align: center; margin: 0;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 550px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border-collapse: collapse;">
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 35px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">DealVeel</h1>
              <p style="color: #99f6e4; margin: 5px 0 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Properties</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 35px; color: #334155; text-align: left; line-height: 1.6;">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 600; margin-bottom: 20px;">Verify Your Email Address</h2>
              <p style="font-size: 15px; color: #475569; margin-bottom: 25px;">
                Thank you for signing up with DealVeel! To complete your registration and activate your account, please verify your email using the verification code (OTP) below. This code is valid for <strong>15 minutes</strong>.
              </p>
              
              <div style="text-align: center; margin: 30px 0; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 12px; padding: 24px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0d9488;">${otp}</span>
              </div>
              
              <p style="font-size: 13px; color: #64748b; margin-top: 25px; margin-bottom: 0;">
                If you did not create a DealVeel account, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 35px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0;">&copy; ${currentYear} DealVeel. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("Email verification OTP sent:", info.messageId);
  return info;
}

module.exports = {
  sendPasswordResetOtp,
  sendEmailVerificationOtp,
  getNodemailerConfig,
};