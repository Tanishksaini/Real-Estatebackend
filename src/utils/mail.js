const emailjs = require("@emailjs/nodejs");

function getEmailJsConfig() {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    return null;
  }

  return { serviceId, templateId, publicKey, privateKey };
}

async function sendPasswordResetOtp(email, otp) {
  const cfg = getEmailJsConfig();
  if (!cfg) {
    throw new Error(
      "EmailJS is not configured. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY in .env"
    );
  }

  const templateParams = {
    to_email: email,
    user_email: email,
    email,
    otp,
    message: `Your password reset OTP is ${otp}. Valid for 10 minutes.`
  };

  await emailjs.send(cfg.serviceId, cfg.templateId, templateParams, {
    publicKey: cfg.publicKey,
    privateKey: cfg.privateKey
  });
}

module.exports = { sendPasswordResetOtp, getEmailJsConfig };
