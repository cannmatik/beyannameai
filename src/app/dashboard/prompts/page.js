"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "@/app/styles/dashboard-style.css";
import { DataGrid } from "@mui/x-data-grid";
import {
  Button,
  Box,
  TextField,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from "@mui/material";

export default function PromptsPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [systemInstructions, setSystemInstructions] = useState("");
  const [model, setModel] = useState("claude-3-7-sonnet-latest");
  const [maxTokens, setMaxTokens] = useState(15000); // Default 15,000
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  const columns = [
    { field: "id", headerName: "ID", width: 100 },
    { field: "company_id", headerName: "Şirket ID", width: 120 },
    {
      field: "system_instructions",
      headerName: "System Instructions",
      width: 250,
      renderCell: (params) => {
        const text = params.value || "";
        return text.length > 30 ? text.substring(0, 30) + "..." : text;
      },
    },
    {
      field: "prompt",
      headerName: "Prompt",
      width: 250,
      renderCell: (params) => {
        const text = params.row.prompt?.text || ""; // jsonb olduğu için .text
        return text.length > 30 ? text.substring(0, 30) + "..." : text;
      },
    },
    { field: "model", headerName: "Model", width: 150 },
    { field: "max_tokens", headerName: "Max Tokens", width: 120 },
    { field: "is_custom", headerName: "Şirkete Özel Prompt", width: 150, type: "boolean" },
    {
      field: "actions",
      headerName: "İşlemler",
      width: 200,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handleEditPrompt(params.row)}
            disabled={loading || params.row.company_id === 9999} // Generic prompt düzenlenemez
          >
            Düzenle
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={() => handleDeletePrompt(params.row.id)}
            disabled={loading || params.row.company_id === 9999} // Generic prompt silinemez
          >
            Sil
          </Button>
        </Box>
      ),
    },
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      await fetchPrompts();
      await fetchCompanies();
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const fetchPrompts = async () => {
    try {
      setError("");
      setLoading(true);
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setPrompts(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setError("");
      setLoading(true);
      const { data, error } = await supabase
        .from("company_info")
        .select("id, firma_adi")
        .order("firma_adi", { ascending: true });
      if (error) throw error;
      setCompanies(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrompt = async (e) => {
    e.preventDefault();
    if (!newPrompt || !selectedCompany || !systemInstructions) {
      setError("Lütfen tüm alanları doldurun.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const promptObject = { text: newPrompt }; // jsonb formatında saklanacak
      const { error } = await supabase.from("prompts").insert([{
        company_id: selectedCompany,
        prompt: promptObject, // jsonb olarak ekleniyor
        system_instructions: systemInstructions,
        model,
        max_tokens: maxTokens,
        is_custom: isCustom,
      }]);
      if (error) throw error;
      setNewPrompt("");
      setSelectedCompany("");
      setSystemInstructions("");
      setModel("claude-3-7-sonnet-latest");
      setMaxTokens(15000); // Default 15,000
      setIsCustom(false);
      await fetchPrompts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPrompt = (prompt) => {
    if (prompt.company_id === 9999) return; // Generic prompt düzenlenemez
    setEditingPrompt({
      ...prompt,
      prompt: prompt.prompt?.text || "", // jsonb’dan text’i alıyoruz
    });
    setEditDialogOpen(true);
  };

  const handleUpdatePrompt = async (e) => {
    e.preventDefault();
    if (!editingPrompt.prompt || !editingPrompt.system_instructions || !editingPrompt.company_id) {
      setError("Lütfen tüm alanları doldurun.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const promptObject = { text: editingPrompt.prompt }; // jsonb formatında güncellenecek
      const { error } = await supabase
        .from("prompts")
        .update({
          company_id: editingPrompt.company_id,
          prompt: promptObject, // jsonb olarak güncelleniyor
          system_instructions: editingPrompt.system_instructions,
          model: editingPrompt.model,
          max_tokens: editingPrompt.max_tokens,
          is_custom: editingPrompt.is_custom,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingPrompt.id);
      if (error) throw error;
      setEditDialogOpen(false);
      setEditingPrompt(null);
      await fetchPrompts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrompt = async (id) => {
    if (!id) return;
    const prompt = prompts.find((p) => p.id === id);
    if (prompt?.company_id === 9999) return; // Generic prompt silinemez
    try {
      setLoading(true);
      setError("");
      const { error } = await supabase.from("prompts").delete().eq("id", id);
      if (error) throw error;
      await fetchPrompts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="dashboard-container" sx={{ p: 3 }}>
      {loading && <Typography className="loading-bar">⏳ Yükleniyor...</Typography>}
      {error && <Typography className="error-message" color="error">⚠️ {error}</Typography>}

      <Typography variant="h4" className="page-title" sx={{ mb: 4 }}>
        Prompt Düzenleme
      </Typography>

      <Box sx={{ mb: 4, p: 3, bgcolor: "#f5f5f5", borderRadius: 2 }}>
        <Typography variant="h6" className="section-title" sx={{ mb: 2 }}>
          Yeni Prompt Ekle
        </Typography>
        <form onSubmit={handleAddPrompt} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
          <Select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            displayEmpty
            fullWidth
          >
            <MenuItem value="">
              <em>Şirket Seçin</em>
            </MenuItem>
            {companies.map((company) => (
              <MenuItem key={company.id} value={company.id}>
                {company.firma_adi}
              </MenuItem>
            ))}
          </Select>
          <TextField
            label="System Instructions"
            multiline
            rows={4}
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            placeholder="System Instructions girin..."
            fullWidth
          />
          <TextField
            label="Prompt"
            multiline
            rows={4}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Prompt içeriğini girin..."
            fullWidth
          />
          <TextField
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model (örn: claude-3-7-sonnet-latest)"
            fullWidth
          />
          <TextField
            label="Max Tokens"
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            placeholder="Max Tokens"
            fullWidth
          />
          <FormControlLabel
            control={<Checkbox checked={isCustom} onChange={(e) => setIsCustom(e.target.checked)} />}
            label="Şirkete Özel Prompt mu?"
          />
          <Button type="submit" variant="contained" color="primary" disabled={loading}>
            Ekle
          </Button>
        </form>
      </Box>

      <Box>
        <Typography variant="h6" className="section-title" sx={{ mb: 2 }}>
          Mevcut Promptlar
        </Typography>
        <div className="table-wrapper">
          <DataGrid
            rows={prompts}
            columns={columns}
            getRowId={(row) => row.id}
            className="data-table"
            pageSizeOptions={[10, 25, 50]}
            pagination
            autoHeight
            localeText={{
              footerRowPerPage: "Sayfadaki Satır:",
              footerTotalRows: "Toplam Kayıt:",
            }}
            sx={{ bgcolor: "#fff", borderRadius: 2 }}
          />
        </div>
      </Box>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Prompt Düzenle</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {editingPrompt && (
            <form style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Select
                value={editingPrompt.company_id || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, company_id: e.target.value })}
                fullWidth
              >
                <MenuItem value="">
                  <em>Şirket Seçin</em>
                </MenuItem>
                {companies.map((company) => (
                  <MenuItem key={company.id} value={company.id}>
                    {company.firma_adi}
                  </MenuItem>
                ))}
              </Select>
              <TextField
                label="System Instructions"
                multiline
                rows={4}
                value={editingPrompt.system_instructions || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, system_instructions: e.target.value })}
                fullWidth
              />
              <TextField
                label="Prompt"
                multiline
                rows={4}
                value={editingPrompt.prompt || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
                fullWidth
              />
              <TextField
                label="Model"
                value={editingPrompt.model || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, model: e.target.value })}
                fullWidth
              />
              <TextField
                label="Max Tokens"
                type="number"
                value={editingPrompt.max_tokens || ""}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, max_tokens: parseInt(e.target.value) })}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editingPrompt.is_custom || false}
                    onChange={(e) => setEditingPrompt({ ...editingPrompt, is_custom: e.target.checked })}
                  />
                }
                label="Şirkete Özel Prompt mu?"
              />
            </form>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={loading}>
            İptal
          </Button>
          <Button onClick={handleUpdatePrompt} variant="contained" color="primary" disabled={loading}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}