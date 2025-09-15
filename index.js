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

// 🔹 Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
