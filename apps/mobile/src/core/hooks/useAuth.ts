import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
    const { token, isAuthenticated, login, logout, deleteAccount } = useAuthStore();

    return {
        token,
        isAuthenticated,
        login,
        logout,
        deleteAccount,
    };
};
