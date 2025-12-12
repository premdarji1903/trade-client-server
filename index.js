const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const app = express();
const jwt = require("jsonwebtoken");
const { verifyToken } = require("./authMiddleware");
const axios = require("axios");
const QRCode = require("qrcode");
const dayjs = require("dayjs");
const KiteConnect = require("kiteconnect").KiteConnect;

dotenv.config();
app.use(bodyParser.json());
app.use(cors());
// 🔹 MongoDB Connection
mongoose
  .connect(process.env.MONGO_URL ?? MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// 🔹 Schema & Model
const clientSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true },
    clientId: { type: String, required: true },
    trade: { type: [String], required: true },
    role: { type: String, required: true },
    token: { type: String },
    broker: { type: String },
    zerodha_api_key: { type: String },
    zerodha_api_secret: { type: String },
    zerodha_access_token: { type: String },
    api_secret: { type: String },
    api_key: { type: String },
    email: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    lastLogin: { type: String },
    isPaid: { type: Boolean },
  },
  { timestamps: true }
);

const Client = mongoose.model("Client", clientSchema);
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Create Model
const Admin = mongoose.model("Admin", adminSchema, "admin");
const tradeSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  clientName: { type: String, required: true },
  orderId: { type: String, required: true },
  symbol: { type: String, required: true },
  transactionType: { type: String, required: true },
  quantity: { type: Number, required: true },
  entry_price: { type: Number, required: true },
  exit_price: { type: Number },
  pnl: { type: Number },
  trend: { type: String },
  status: { type: String, default: "Pending" },
  created_at: {
    type: String,
    default: () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    },
  },
  exit_time: { type: String }, // store as "YYYY-MM-DD HH:mm:ss"
});

// Collection name: trades
const Trade = mongoose.model("trades", tradeSchema, "trades");

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is Working" });
});

// 🔹 API: Add Client
app.post("/clients", async (req, res) => {
  try {
    const { clientName, clientId, trade, mobileNumber, email, broker } =
      req.body;
    const existingClient = await Client.findOne({
      $or: [{ clientId }, { mobileNumber }, { email }, { clientName }],
    });

    if (existingClient) {
      // Identify which field caused duplication for a more user-friendly message
      let duplicateField = "";
      if (existingClient?.clientId === clientId) duplicateField = "Client ID";
      else if (existingClient?.mobileNumber === mobileNumber)
        duplicateField = "Mobile Number";
      else if (existingClient?.email === email) duplicateField = "Email";

      return res.status(400).json({
        message: `⚠️ ${duplicateField} already exists. Please use a different one.`,
      });
    }

    const client = new Client({
      clientName,
      clientId,
      trade,
      role: "user",
      api_key: "",
      api_secret: "",
      mobileNumber,
      email,
      token: "",
      lastLogin: "",
      isPaid: false,
      broker,
    });
    await client.save();
    res.status(201).json({ message: "Client saved successfully", client });
  } catch (error) {
    res.status(500).json({ message: "Error saving client", error });
  }
});

// // 🔹 API: Get All Clients
// app.get("/clients", async (req, res) => {
//   try {
//     const clients = await Client.find();
//     res.json(clients);
//   } catch (error) {
//     res.status(500).json({ message: "Error fetching clients", error });
//   }
// });

// 🔹 API: Update Client Token
app.patch("/client/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { token } = req.body;
    const getClientInfo = await Client.findOne({ clientId, role: "admin" });

    if (getClientInfo) {
      const updatedClient = await Client.findOneAndUpdate(
        { clientId },
        { token },
        { new: true } // return updated document
      );
      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      } else {
        return res
          .status(200)
          .json({ message: "✅ Token updated successfully", updatedClient });
      }
    }

    // Check if to
    if (!token) {
      return res.status(400).json({ message: "⚠️ Token is required" });
    }

    // Find and update client by clientId
    const updatedClient = await Client.findOneAndUpdate(
      { clientId },
      { token, trade: req?.body?.trade },
      { new: true } // return updated document
    );

    if (!updatedClient) {
      return res.status(404).json({ message: "Client not found" });
    }

    res
      .status(200)
      .json({ message: "✅ Token updated successfully", updatedClient });
  } catch (error) {
    res.status(500).json({ message: "Error updating token", error });
  }
});

// 🔹 API: Login validation
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "⚠️ Mobile number and password are required" });
    }

    // 2️⃣ Find user
    const user = await Admin.findOne({ email: req.body.email.trim() });
    if (!user) {
      return res.status(401).json({ message: "❌ Invalid credentials" });
    }

    // 3️⃣ Check password (⚠️ In production use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({ message: "❌ Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email }, // payload
      process.env.JWT_SECRET || "supersecretkey", // secret key
      { expiresIn: "1d" } // token validity
    );
    // 4️⃣ Success → Only send validation success
    res.status(200).json({ message: "✅ Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Error during login", error });
  }
});

app.get("/trades", verifyToken, async (req, res) => {
  try {
    const { start, end, clientName, page = 1, limit = 10 } = req.query; // added clientName

    let filter = {};

    // Date filter
    if (start && end) {
      filter.created_at = {
        $gte: `${start} 00:00:00`,
        $lte: `${end} 23:59:59`,
      };
    }

    // Client name filter (case-insensitive, partial match)
    if (clientName) {
      filter.clientName = { $regex: clientName, $options: "i" };
    }

    // Pagination calculation
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const trades = await Trade.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ created_at: -1 }); // latest first

    const total = await Trade.countDocuments(filter); // total records
    const totalPages = Math.ceil(total / limit);

    res.json({
      trades,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
    });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error fetching trades", error });
  }
});

app.get("/redirect/:clientMobilenumber", async (req, res) => {
  try {
    console.log("Call Into Redirect Url");
    console.log("req--->", req?.query);
    const token = req?.query?.tokenId;

    const clientMobilenumber = req?.params?.clientMobilenumber;
    console.log("clientMobilenumber", clientMobilenumber);

    const getClientInfo = await Client.findOne({
      mobileNumber: clientMobilenumber,
    });

    if (!getClientInfo) {
      console.log("Client not Found");
    }

    const response = await axios.post(
      `https://auth.dhan.co/app/consumeApp-consent?tokenId=${token}`,
      null,
      {
        headers: {
          app_id: getClientInfo?.api_key,
          app_secret: getClientInfo?.api_secret,
        },
      }
    );

    if (response) {
      const updatedClient = await Client.findOneAndUpdate(
        { mobileNumber: clientMobilenumber },
        {
          token: response?.data?.accessToken,
          lastLogin: dayjs().format("YYYY-MM-DDTHH:mm:ss"),
        },
        { new: true } // return updated document
      );
      console.log("Updated Token ---->", updatedClient);
      const html = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Access Token Updated</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f4f6f8;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
          text-align: center;
          padding: 40px 30px;
          width: 100%;
          max-width: 420px;
          animation: fadeIn 0.6s ease-in-out;
        }
        .icon {
          width: 80px;
          height: 80px;
          background-color: #e6f4ea;
          color: #34a853;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          margin: 0 auto 20px;
        }
        h1 {
          font-size: 22px;
          color: #0052cc;
          margin-bottom: 10px;
        }
        p {
          font-size: 16px;
          color: #444;
          margin-bottom: 30px;
        }
        a.button {
          display: inline-block;
          padding: 12px 24px;
          font-size: 15px;
          color: #ffffff;
          background-color: #0052cc;
          border-radius: 8px;
          text-decoration: none;
          transition: background-color 0.3s ease;
        }
        a.button:hover {
          background-color: #003d99;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Access Token Updated Successfully</h1>
        <p>Your Dhan account access token has been securely updated.</p>
        <a href="/" class="button">Go Back to Dashboard</a>
      </div>
    </body>
  </html>
  `;

      res.status(200).send(html);
    } else {
      res.send("hello world");
    }
  } catch (err) {
    console.log("Error", err);
  }
});

app.get("/:clientMobilenumber", async (req, res) => {
  try {
    console.log("Call Into Redirect Url");
    console.log("req.query --->", req?.query);

    // Correctly extract request_token
    const requestToken = req?.query?.request_token;
    const clientMobilenumber = req?.params?.clientMobilenumber;

    console.log("Client Mobile Number:", clientMobilenumber);
    console.log("Request Token:", requestToken);

    const getClientInfo = await Client.findOne({
      mobileNumber: clientMobilenumber,
    });
    console.log("Get Client Info --->", getClientInfo);
    if (!getClientInfo) {
      console.log("Client not Found");
      return res.status(404).send("Client not found");
    }

    // Here you can call your function to generate Zerodha access token
    // using requestToken and api_secret from getClientInfo
    const kite = new KiteConnect({ api_key: getClientInfo.zerodha_api_key });

    const sessionData = await kite.generateSession(
      requestToken,
      getClientInfo.zerodha_api_secret
    );
    console.log("sessionData", sessionData);

    const accessToken = sessionData.access_token;
    console.log("accessToken", accessToken);

    // Update client document with access token
    const updatedClient = await Client.findOneAndUpdate(
      { mobileNumber: clientMobilenumber },
      {
        zerodha_access_token: accessToken,
        // lastLogin: new Date(),
      },
      { new: true }
    );

    console.log("Updated Client ---->", updatedClient);

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Access Token Updated</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background:#f4f6f8; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .card { background:#fff; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.1); text-align:center; padding:40px 30px; max-width:420px; }
        .icon { width:80px; height:80px; background:#e6f4ea; color:#34a853; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:40px; margin:0 auto 20px; }
        h1 { font-size:22px; color:#0052cc; margin-bottom:10px; }
        p { font-size:16px; color:#444; margin-bottom:30px; }
        a.button { display:inline-block; padding:12px 24px; font-size:15px; color:#fff; background:#0052cc; border-radius:8px; text-decoration:none; }
        a.button:hover { background:#003d99; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Access Token Updated Successfully</h1>
        <p>Your Zerodha access token has been securely updated.</p>
        <a href="/" class="button">Go Back to Dashboard</a>
      </div>
    </body>
    </html>
    `;

    res.status(200).send(html);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Webhook callback URL (same as you gave in Dhan dashboard)
app.post("/callback", (req, res) => {
  console.log("=== /callback Endpoint Hit ===");
  console.log("Query params:", req.query);
  console.log("Body params:", req.body);
  res.send("✅ Received tokenId / order update. Check console logs.");
});

// 🔹 API: Update Client Token
app.patch("/clients/:clientId/apikeys", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { api_key, api_secret } = req.body;
    const getClientInfo = await Client.findById({
      _id: clientId,
      role: "user",
    });
    if (getClientInfo) {
      const updatedClient = await Client.findByIdAndUpdate(
        { _id: clientId },
        { api_key, api_secret },
        { new: true } // return updated document
      );
      if (!updatedClient) {
        res.status(404).json({ message: "Client not found" });
      } else {
        res
          .status(200)
          .json({ message: "✅ Api Key updated successfully", updatedClient });
      }
    }

    if (!getClientInfo) {
      res.status(404).json({ message: "Client not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error updating token", error });
  }
});

// 📱 POST: Generate Payment QR Code Image
app.post("/generate-qr", async (req, res) => {
  try {
    const { amount, note } = req.body;

    // 🧾 Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ message: "⚠️ Please provide a valid amount" });
    }

    // 🏦 Create UPI Payment URL
    const upiUrl = `upi://pay?pa=${encodeURIComponent(
      process.env.UPI_ID
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note || "Payment")}`;

    // 🖼️ Set header to return PNG
    res.setHeader("Content-Type", "image/png");

    // 🔁 Generate QR Code and pipe directly to response
    QRCode.toFileStream(res, upiUrl);
  } catch (error) {
    console.error("QR generation failed:", error);
    res.status(500).json({ message: "❌ Failed to generate QR code" });
  }
});

app.get("/clients/all-clients", async (req, res) => {
  try {
    // 📄 Extract pagination params (defaults)
    const page = parseInt(req.query.page) || 1; // current page number
    const limit = parseInt(req.query.limit) || 10; // records per page

    // 🧮 Calculate skip value
    const skip = (page - 1) * limit;

    // 🧾 Fetch total count of users with role: "user"
    const totalUsers = await Client.countDocuments({ role: "user" });

    // 📋 Fetch paginated data
    const clients = await Client.find({ role: "user" })
      .sort({ clientName: 1 })
      .skip(skip)
      .limit(limit);

    // ✅ Send structured response
    res.status(200).json({
      message: "✅ Users fetched successfully",
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      pageSize: limit,
      clients,
    });
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "❌ Error fetching clients", error });
  }
});

app.patch("/clients/:clientId/isPaid", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { isPaid } = req.body;

    const client = await Client.findByIdAndUpdate(
      clientId,
      { isPaid },
      { new: true }
    );

    if (!client) return res.status(404).json({ message: "Client not found" });

    res.json({ message: "✅ isPaid status updated", client });
  } catch (error) {
    res.status(500).json({ message: "Error updating isPaid", error });
  }
});

app.patch("/clients/:clientId/trades", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { trade } = req.body; // expecting trade to be an array like ["Nifty", "Crude Oil"]

    if (!Array.isArray(trade)) {
      return res.status(400).json({ message: "❌ 'trade' must be an array" });
    }

    const updatedData = { trade };

    if(req?.body?.broker){
      updatedData.broker = req?.body?.broker;
    }
    const client = await Client.findByIdAndUpdate(
      clientId,
      { ...updatedData },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json({
      message: "✅ Trades updated successfully",
      client,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating trades",
      error: error.message,
    });
  }
});

app.delete("/clients/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;

    const deletedClient = await Client.findByIdAndDelete(clientId);

    if (!deletedClient) {
      return res.status(404).json({ message: "❌ Client not found" });
    }

    res.json({
      message: "🗑️ Client deleted permanently",
      deletedClient,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting client",
      error: error.message,
    });
  }
});

// 🔹 Start Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
