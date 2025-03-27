"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "@/app/styles/dashboard-style.css";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Box, TextField, Select, MenuItem } from "@mui/material";

export default function PromptsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [prompts, setPrompts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const columns = [
    { field: "id", headerName: "ID", width: 100 },
    { field: "company_id", headerName: "Şirket ID", flex: 1 },
    {
      field: "prompt",
      headerName: "Prompt (Özet)",
      flex: 2,
      renderCell: (params) => {
        const text = params.value || "";
        return text.length > 50 ? text.substring(0, 50) + "..." : text;
      },
    },
    {
      field: "actions",
      headerName: "İşlemler",
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={() => handleDeletePrompt(params.row.id)}
          disabled={loading}
        >
          Sil
        </Button>
      ),
    },
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Kullanıcı kontrolü
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Prompt ve şirket verilerini çek
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
        .select("id, firma_adi");
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
    if (!newPrompt || !selectedCompany) {
      setError("Lütfen bir prompt ve şirket seçin.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const { error } = await supabase
        .from("prompts")
        .insert([{ company_id: selectedCompany, prompt: newPrompt }]);
      if (error) throw error;
      setNewPrompt("");
      setSelectedCompany("");
      await fetchPrompts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrompt = async (id) => {
    if (!id) return;
    try {
      setLoading(true);
      setError("");
      const { error } = await supabase
        .from("prompts")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await fetchPrompts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Box className="dashboard-container">
      {/* Navbar */}
      <Box className="navbar">
        <Link href="/dashboard">
          <Button className={`nav-button ${pathname === "/dashboard" ? "active" : ""}`}>
            Kontrol Paneli
          </Button>
        </Link>
        <Link href="/analiz">
          <Button className={`nav-button ${pathname === "/analiz" ? "active" : ""}`}>
            Analiz
          </Button>
        </Link>
        <Link href="/dashboard/file-management">
          <Button className={`nav-button ${pathname === "/dashboard/file-management" ? "active" : ""}`}>
            Dosya Yönetimi
          </Button>
        </Link>
        <Link href="/dashboard/prompts">
          <Button className={`nav-button ${pathname === "/dashboard/prompts" ? "active" : ""}`}>
            Prompt Yönetimi
          </Button>
        </Link>
        <Link href="/admin">
          <Button className={`nav-button ${pathname === "/admin" ? "active" : ""}`}>
            Admin Panel
          </Button>
        </Link>
        <Button onClick={handleLogout} className="logout-button">
          Çıkış Yap
        </Button>
      </Box>

      {loading && <div className="loading-bar">⏳ Yükleniyor...</div>}
      {error && <div className="error-message">⚠️ {error}</div>}

      <h1 className="page-title">Prompt Düzenleme</h1>

      {/* Yeni Prompt Ekleme Formu */}
      <Box sx={{ marginBottom: "32px" }}>
        <h2 className="section-title">Yeni Prompt Ekle</h2>
        <form onSubmit={handleAddPrompt} style={{ display: "flex", flexDirection: "column", maxWidth: 400 }}>
          <Select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            displayEmpty
            sx={{ marginBottom: 2 }}
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
            multiline
            rows={4}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Prompt içeriğini girin..."
            sx={{ marginBottom: 2 }}
          />
          <Button type="submit" variant="contained" disabled={loading}>
            Ekle
          </Button>
        </form>
      </Box>

      {/* Mevcut Promptlar Tablosu */}
      <Box>
        <h2 className="section-title">Mevcut Promptlar</h2>
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
          />
        </div>
      </Box>
    </Box>
  );
}