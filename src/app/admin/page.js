"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Box } from "@mui/material";
import "@/app/styles/dashboard-style.css";

export default function AdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(null);

  // MUI DataGrid kolonlar
  const columns = [
    {
      field: "email",
      headerName: "E-posta",
      flex: 1,
      editable: true, // E-posta düzenlenebilir
    },
    {
      field: "created_at",
      headerName: "Eklenme Tarihi",
      flex: 1,
      renderCell: (params) => {
        const date = new Date(params.row.created_at);
        return date.toLocaleDateString("tr-TR");
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
          onClick={() => handleDeleteAdmin(params.row.id)}
          disabled={loading}
        >
          Sil
        </Button>
      ),
    },
  ];

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  const checkAdminAndFetchData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: adminData, error: adminError } = await supabase
      .from("admin")
      .select("id")
      .eq("id", user.id)
      .single();

    if (adminError || !adminData) {
      setIsAdmin(false);
      setLoading(false);
    } else {
      setIsAdmin(true);
      await fetchAdmins();
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin")
        .select("id, email, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (id) => {
    try {
      setLoading(true);
      setError("");
      const { error } = await supabase.from("admin").delete().eq("id", id);
      if (error) throw error;
      await fetchAdmins();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditAdmin = async (params) => {
    const { id, field, value } = params;
    if (field === "email") {
      try {
        setLoading(true);
        setError("");
        const { error } = await supabase
          .from("admin")
          .update({ email: value })
          .eq("id", id);
        if (error) throw error;
        await fetchAdmins();
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isAdmin === null) {
    return (
      <Box className="dashboard-container">
        <div className="loading-bar">⏳ Yetki kontrolü yapılıyor...</div>
      </Box>
    );
  }

  if (!isAdmin) {
    return (
      <Box className="dashboard-container">
        <Box className="navbar">
          <Link href="/dashboard">
            <Button className="nav-button">Kontrol Paneli</Button>
          </Link>
          <Button onClick={handleLogout} className="logout-button">
            Çıkış Yap
          </Button>
        </Box>
        <div className="error-message">⚠️ Yetkisiz Erişim: Bu sayfaya erişim yetkiniz yok.</div>
      </Box>
    );
  }

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

      <h1 className="page-title">Admin Yönetimi</h1>

      {/* Admin tablosu */}
      <Box>
        <h2 className="section-title">Mevcut Adminler</h2>
        <div className="table-wrapper">
          <DataGrid
            rows={admins}
            columns={columns}
            getRowId={(row) => row.id}
            className="data-table"
            pageSizeOptions={[10, 25, 50]}
            pagination
            autoHeight
            onCellEditCommit={handleEditAdmin} // Hücre düzenlendiğinde tetiklenir
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