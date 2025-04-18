import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Plus, Edit, Trash2 } from "lucide-react";
import { useFleet } from "../context/FleetContext";
import { db, auth } from "../firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import Button from "./Button";

const Reports = () => {
  const navigate = useNavigate();
  const { darkMode, reports, fetchReports } = useFleet();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    date: "",
    description: "",
    status: "Pending",
  });
  const [error, setError] = useState(null);

  const themeStyles = {
    background: darkMode ? "linear-gradient(135deg, #080016 0%, #150025 100%)" : "linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)",
    color: darkMode ? "#fff" : "#000",
    cardBg: darkMode ? "rgba(20, 10, 40, 0.7)" : "rgba(255, 255, 255, 0.9)",
    cardBorder: darkMode ? "2px solid rgba(250, 204, 21, 0.5)" : "2px solid rgba(59, 130, 246, 0.5)",
    cardGlow: darkMode ? "0 0 15px rgba(250, 204, 21, 0.3)" : "0 0 15px rgba(59, 130, 246, 0.2)",
  };

  const statusOptions = ["Pending", "Completed", "In Progress", "Canceled"];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const reportData = {
        ...formData,
        date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
        userId: auth.currentUser.uid, // Add userId
      };

      if (editingReport) {
        const reportRef = doc(db, "reports", editingReport.id);
        await updateDoc(reportRef, reportData);
        setEditingReport(null);
      } else {
        await addDoc(collection(db, "reports"), reportData);
      }

      await fetchReports();
      setFormData({ title: "", date: "", description: "", status: "Pending" });
      setShowAddForm(false);
    } catch (error) {
      console.error("Error saving report:", error.message);
      setError("Failed to save report. Please check your input and try again.");
    }
  };

  const handleDelete = async (id) => {
    try {
      const reportRef = doc(db, "reports", id);
      await deleteDoc(reportRef);
      await fetchReports();
    } catch (error) {
      console.error("Error deleting report:", error.message);
      setError("Failed to delete report. Please try again.");
    }
  };

  const handleEdit = (report) => {
    setEditingReport(report);
    setFormData({
      title: report.title || "",
      date: report.date ? new Date(report.date).toISOString().split("T")[0] : "",
      description: report.description || "",
      status: report.status || "Pending",
    });
    setShowAddForm(true);
  };

  return (
    <motion.div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...themeStyles,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div style={{ flex: "1 0 auto" }}>
        <header
          style={{
            background: darkMode ? "rgba(0, 0, 0, 0.5)" : "#e5e7eb",
            padding: "12px 16px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div
            style={{
              maxWidth: "1280px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h1
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                color: darkMode ? "#facc15" : "#1f2937",
              }}
            >
              <FileText style={{ marginRight: "8px" }} /> Report Management
            </h1>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus size={16} /> Create New Report
              </Button>
              <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
            </div>
          </div>
        </header>

        {showAddForm && (
          <motion.div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 20 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div
              style={{
                background: themeStyles.cardBg,
                maxWidth: "500px",
                margin: "40px auto",
                padding: "24px",
                borderRadius: "8px",
                border: themeStyles.cardBorder,
                boxShadow: themeStyles.cardGlow,
              }}
            >
              <h2 style={{ color: darkMode ? "#facc15" : "#1f2937", marginBottom: "16px" }}>
                {editingReport ? "Edit Report Details" : "Create a New Report"}
              </h2>
              {error && <p style={{ color: "#ef4444", marginBottom: "12px" }}>{error}</p>}
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
                <input
                  style={{ padding: "8px", borderRadius: "4px", border: themeStyles.cardBorder, background: darkMode ? "#1a0033" : "#fff" }}
                  placeholder="Report Title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
                <input
                  style={{ padding: "8px", borderRadius: "4px", border: themeStyles.cardBorder, background: darkMode ? "#1a0033" : "#fff" }}
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
                <textarea
                  style={{ padding: "8px", borderRadius: "4px", border: themeStyles.cardBorder, background: darkMode ? "#1a0033" : "#fff", minHeight: "100px" }}
                  placeholder="Description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
                <select
                  style={{ padding: "8px", borderRadius: "4px", border: themeStyles.cardBorder, background: darkMode ? "#1a0033" : "#fff", color: darkMode ? "#fff" : "#000" }}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status} style={{ color: darkMode ? "#fff" : "#000" }}>
                      {status}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button type="submit">{editingReport ? "Update Report" : "Add Report"}</Button>
                  <Button
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingReport(null);
                      setFormData({ title: "", date: "", description: "", status: "Pending" });
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        )}

        <main style={{ padding: "16px", flexGrow: 1 }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
            {reports.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
                {reports.map((report) => (
                  <motion.div
                    key={report.id}
                    style={{
                      background: darkMode
                        ? "linear-gradient(135deg, #1a0033 0%, #330066 70%)"
                        : "linear-gradient(135deg, #e5e7eb 0%, #ffffff 100%)",
                      border: themeStyles.cardBorder,
                      borderRadius: "12px",
                      padding: "20px",
                      boxShadow: themeStyles.cardGlow,
                      position: "relative",
                      overflow: "hidden",
                    }}
                    whileHover={{ scale: 1.05, boxShadow: darkMode ? "0 0 25px rgba(250, 204, 21, 0.5)" : "0 0 25px rgba(59, 130, 246, 0.4)" }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: darkMode ? "rgba(250, 204, 21, 0.1)" : "rgba(59, 130, 246, 0.1)",
                        clipPath: "polygon(0 0, 100% 0, 85% 100%, 0% 100%)",
                        opacity: 0.3,
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", position: "relative", zIndex: 1 }}>
                      <h3 style={{ color: darkMode ? "#facc15" : "#1f2937", fontWeight: "700", fontSize: "18px", textShadow: darkMode ? "0 0 5px rgba(250, 204, 21, 0.5)" : "none" }}>
                        {report.title}
                      </h3>
                      <div style={{ display: "flex", gap: "12px" }}>
                        <Edit size={22} style={{ cursor: "pointer", color: darkMode ? "#facc15" : "#3b82f6" }} onClick={() => handleEdit(report)} />
                        <Trash2 size={22} style={{ cursor: "pointer", color: "#dc2626" }} onClick={() => handleDelete(report.id)} />
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "10px", fontSize: "14px", position: "relative", zIndex: 1 }}>
                      <p style={{ color: darkMode ? "#d1d5db" : "#4b5563" }}>
                        Date: <span style={{ color: darkMode ? "#fff" : "#000" }}>{report.date ? new Date(report.date).toLocaleDateString() : "N/A"}</span>
                      </p>
                      <p style={{ color: darkMode ? "#d1d5db" : "#4b5563" }}>
                        Description: <span style={{ color: darkMode ? "#fff" : "#000" }}>{report.description || "N/A"}</span>
                      </p>
                      <p style={{ color: darkMode ? "#d1d5db" : "#4b5563" }}>
                        Status:{" "}
                        <span
                          style={{
                            color:
                              report.status === "Completed"
                                ? "#22c55e"
                                : report.status === "Pending"
                                ? "#facc15"
                                : report.status === "In Progress"
                                ? "#3b82f6"
                                : "#ef4444",
                            fontWeight: "600",
                            textShadow: darkMode ? "0 0 3px rgba(255, 255, 255, 0.2)" : "none",
                          }}
                        >
                          {report.status || "N/A"}
                        </span>
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div style={{ background: themeStyles.cardBg, padding: "24px", borderRadius: "8px", textAlign: "center", border: themeStyles.cardBorder }}>
                <p style={{ color: darkMode ? "#facc15" : "#1f2937" }}>No reports available. Click "Create New Report" to get started!</p>
              </motion.div>
            )}
          </div>
        </main>
      </div>

      <footer
        style={{
          background: darkMode ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.9)",
          padding: "16px",
          textAlign: "center",
          color: darkMode ? "#9ca3af" : "#6b7280",
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        © {new Date().getFullYear()} FleetTraq
      </footer>
    </motion.div>
  );
};

export default Reports;