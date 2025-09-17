const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv=require('dotenv')
const app = express();
dotenv.config()
app.use(bodyParser.json());
app.use(cors());
// 🔹 MongoDB Connection
mongoose
    .connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// 🔹 Schema & Model
const clientSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    clientId: { type: String, required: true },
    token: { type: String, required: true }
});


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
  created_at: { type: String, default: () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }},
  exit_time: { type: String }, // store as "YYYY-MM-DD HH:mm:ss"
});


// Collection name: trades
const Trade = mongoose.model("trades", tradeSchema,"trades");
// 🔹 API: Add Client
app.post("/clients", async (req, res) => {
    try {
        const { clientName, clientId, token } = req.body;

        // Check if any field is missing
        if (!clientName || !clientId || !token) {
            return res.status(400).json({ message: "⚠️ All fields are required" });
        }

        // Check if clientId already exists
        const existingClient = await Client.findOne({ clientId });
        if (existingClient) {
            return res.status(400).json({ message: "Client ID already exists" });
        }
        const client = new Client({ clientName, clientId, token });
        await client.save();
        res.status(201).json({ message: "Client saved successfully", client });
    } catch (error) {
        res.status(500).json({ message: "Error saving client", error });
    }
});

// 🔹 API: Get All Clients
app.get("/clients", async (req, res) => {
    try {
        const clients = await Client.find();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: "Error fetching clients", error });
    }
});

// 🔹 API: Update Client Token
app.patch("/client/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const { token } = req.body;

        // Check if token is provided
        if (!token) {
            return res.status(400).json({ message: "⚠️ Token is required" });
        }

        // Find and update client by clientId
        const updatedClient = await Client.findOneAndUpdate(
            { clientId },
            { token },
            { new: true } // return updated document
        );

        if (!updatedClient) {
            return res.status(404).json({ message: "Client not found" });
        }

        res.status(200).json({ message: "✅ Token updated successfully", updatedClient });
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
      return res.status(400).json({ message: "⚠️ Mobile number and password are required" });
    }

    // 2️⃣ Find user
    const user =  await Admin.findOne({ email: req.body.email.trim() });
    if (!user) {
      return res.status(401).json({ message: "❌ Invalid credentials" });
    }

    // 3️⃣ Check password (⚠️ In production use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({ message: "❌ Invalid credentials" });
    }

    // 4️⃣ Success → Only send validation success
    res.status(200).json({ message: "✅ Login successful" });
  } catch (error) {
    res.status(500).json({ message: "Error during login", error });
  }
});

app.get("/trades", async (req, res) => {
  try {
    const { start, end } = req.query; // optional query params YYYY-MM-DD

    let filter = {};

    if (start && end) {
      // If both start and end are provided, filter trades between these dates
      filter.created_at = {
        $gte: `${start} 00:00:00`,
        $lte: `${end} 23:59:59`,
      };
    } else {
      // Default: today
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;

      filter.created_at = { $regex: `^${todayStr}` };
    }

    const trades = await Trade.find(filter);
    res.json(trades);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Error fetching trades", error });
  }
});

// 🔹 Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
