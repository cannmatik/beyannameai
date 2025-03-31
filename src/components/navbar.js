"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Toolbar,
  IconButton,
  Button,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAdmin, loading } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.dispatchEvent(new Event("logout")); // Çıkış olayını tetikle
    window.location.href = "/login"; // Login sayfasına yönlendir
  };

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const menuItems = [
    { text: "Kontrol Paneli", href: "/dashboard" },
    { text: "Analiz", href: "/analiz" },
    { text: "Dosya Yönetimi", href: "/dashboard/file-management" },
    ...(isAdmin && !loading
      ? [
          { text: "Prompt Yönetimi", href: "/dashboard/prompts" },
          { text: "Admin Panel", href: "/admin" },
        ]
      : []),
  ];

  return (
    <Box sx={{ width: "100%", py: 2 }}>
      <AppBar
        position="static"
        sx={{
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
          maxWidth: "1280px",
          width: "100%",
          mx: "auto",
          bgcolor: "#fff",
          color: "#000",
          borderRadius: "6px",
          overflowX: "hidden",
        }}
      >
        <Toolbar
          sx={{
            padding: { xs: "0 16px", md: "0 32px" },
            minHeight: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <IconButton
            edge="start"
            aria-label="menu"
            onClick={toggleMenu}
            sx={{
              display: { xs: "block", md: "none" },
              color: "#bd2f2c",
              "&:hover": { bgcolor: "#f5f5f5" },
            }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 2 }}>
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant="text"
                  sx={{
                    fontWeight: 900,
                    fontFamily: "Montserrat, sans-serif",
                    textTransform: "none",
                    color: pathname === item.href ? "#fff" : "#000",
                    bgcolor: pathname === item.href ? "#bd2f2c" : "transparent",
                    "&:hover": {
                      bgcolor: pathname === item.href ? "#a52825" : "#f5f5f5",
                      color: pathname === item.href ? "#fff" : "#bd2f2c",
                    },
                    borderRadius: "3px",
                    padding: "6px 16px",
                    boxShadow: "none",
                  }}
                >
                  {item.text}
                </Button>
              </Link>
            ))}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Box
            sx={{
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              bgcolor: "#fff",
              transition: "background-color 0.3s ease-in-out",
              "&:hover": {
                bgcolor: "#bd2f2c",
              },
            }}
          >
            <IconButton
              onClick={handleLogout}
              sx={{
                width: "100%",
                height: "100%",
                padding: "0",
                color: "#bd2f2c",
                transition: "color 0.3s ease-in-out",
                "&:hover": { color: "#fff" },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={isMenuOpen}
        onClose={toggleMenu}
        sx={{
          "& .MuiDrawer-paper": {
            width: 250,
            bgcolor: "#fff",
          },
        }}
      >
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component="a"
                href={item.href}
                selected={pathname === item.href}
                onClick={toggleMenu}
                sx={{
                  "&.Mui-selected": {
                    bgcolor: "#bd2f2c",
                    color: "#fff",
                    "&:hover": { bgcolor: "#a52825" },
                  },
                  "&:hover": { bgcolor: "#f5f5f5" },
                }}
              >
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    sx: {
                      fontWeight: 900,
                      fontFamily: "Montserrat, sans-serif",
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => {
                handleLogout();
                toggleMenu();
              }}
              sx={{
                bgcolor: "#bd2f2c",
                color: "#fff",
                "&:hover": { bgcolor: "#a52825" },
              }}
            >
              <ListItemText
                primary="Çıkış Yap"
                primaryTypographyProps={{
                  sx: {
                    fontWeight: 900,
                    fontFamily: "Montserrat, sans-serif",
                  },
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
    </Box>
  );
}