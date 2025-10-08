const API_KEY = "49349723";
const API_SECRET_KEY = "1829b061-7ef1-4e93-b8be-f90703eb81d9";
const axios = require("axios");

async function generateConsentToken(dhanClientId, apiKey, apiSecret) {
  try {
    const url = `https://auth.dhan.co/app/generate-consent?client_id=${dhanClientId}`;

    const response = await axios.post(url, null, {
      headers: {
        app_id: apiKey,
        app_secret: apiSecret,
      },
    });

    return response.data;
  } catch (error) {
    console.error(
      "❌ Error generating consent token:",
      error.response?.data || error.message
    );``
    return null;
  }
}

async function browserbasedUrl(consentAppId) {
  try {
    const url = `https://auth.dhan.co/login/consentApp-login?consentAppId=${consentAppId}`;
    console.log("Redirecting to:", url);
    return url
  } catch (error) {
    console.error(
      "❌ Error generating consent token:",
      error.response?.data || error.message
    );
    return null;
  }
}

// Example usage
(async () => {
  const dhanClientId = "1105581093";

  const result = await generateConsentToken(
    dhanClientId,
    API_KEY,
    API_SECRET_KEY
  );

  const browserbasedUrlResult = await browserbasedUrl(result?.consentAppId);
  console.log("Consent token response:", result);
  // console.log("browserbasedUrlResult:", browserbasedUrlResult);
})();
