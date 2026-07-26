const axios = require("axios");

const sendOtpToPhone = async (phoneNumber, otp) => {
  const API_KEY = process.env.TWO_FACTOR_API_KEY;

  try {
    // ✅ CUSTOM OTP (correct for your flow)
    const url = `https://2factor.in/API/V1/${API_KEY}/SMS/${phoneNumber}/${otp}/TryMyLook_OTP`;

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        method: 'SMS'  // Try explicitly passing method
      },
      timeout: 15000
    });


    console.log("✅ OTP sent to:", phoneNumber);
    console.log("📩 Full Response:", response.data);

    return response.data;

  } catch (error) {
    console.error("❌ Error sending OTP:");
    console.error("📛 Status:", error.response?.status);
    console.error("📛 Data:", error.response?.data);
    console.error("📛 Message:", error.message);

    throw error;
  }
};

module.exports = sendOtpToPhone;