"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import Navbar from "@/components/navbar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography,
  Box,
} from "@mui/material";

export default function AuthCheck({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const excludePaths = ["/", "/login", "/signup"];
  const shouldExclude = excludePaths.includes(pathname);

  useEffect(() => {
    if (!loading) {
      if (!user && !shouldExclude && !isLoggingOut) {
        setOpen(true);
        const timer = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 100) {
              clearInterval(timer);
              router.push("/");
              setOpen(false); // Yönlendirme tamamlanınca kapat
              return 100;
            }
            return prev + 100 / 30;
          });
        }, 100);

        return () => clearInterval(timer);
      } else {
        setOpen(false); // Kullanıcı varsa veya hariç tutulan bir sayfadaysak kapat
        setProgress(0); // Progress’i sıfırla
      }
    }
  }, [loading, user, router, pathname, shouldExclude, isLoggingOut]);

  useEffect(() => {
    const handleLogout = () => {
      setIsLoggingOut(true);
      setOpen(false);
      setProgress(0);
      setTimeout(() => setIsLoggingOut(false), 1000);
    };

    window.addEventListener("logout", handleLogout);
    return () => window.removeEventListener("logout", handleLogout);
  }, []);

  if (loading) {
    return <Typography>Yükleniyor...</Typography>;
  }

  return (
    <>
      {!shouldExclude && (
        <header className="mb-6 w-full shrink-0">
          <Navbar />
        </header>
      )}
      {children}
      <Dialog open={open} disableEscapeKeyDown>
        <DialogTitle>Lütfen Giriş Yapın</DialogTitle>
        <DialogContent>
          <Typography>
            Ana sayfaya yönlendiriliyorsunuz...
          </Typography>
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}