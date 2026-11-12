import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { Layout } from '@/components/layout/Layout';
import { HomePage } from '@/pages/home/HomePage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignUpPage } from '@/pages/auth/SignUpPage';
import { ProfileSetupPage } from '@/pages/profile/ProfileSetupPage';
import { CreateRoomPage } from '@/pages/room/CreateRoomPage';
import { JoinRoomPage } from '@/pages/room/JoinRoomPage';
import { LobbyPage } from '@/pages/room/LobbyPage';
import { AdminImportPage } from '@/pages/admin/AdminImportPage';
import { AdminContentPage } from '@/pages/admin/AdminContentPage';
import { AboutPage } from '@/pages/about/AboutPage';
import { NotFoundPage } from '@/pages/not-found/NotFoundPage';

export const App: React.FC = () => {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignUpPage />} />
          <Route path="profile" element={<ProfileSetupPage />} />
          <Route path="create" element={<CreateRoomPage />} />
          <Route path="join" element={<JoinRoomPage />} />
          <Route path="join/:code" element={<JoinRoomPage />} />
          <Route path="room/:code" element={<LobbyPage />} />
          <Route path="admin/import" element={<AdminImportPage />} />
          <Route path="admin/content" element={<AdminContentPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
