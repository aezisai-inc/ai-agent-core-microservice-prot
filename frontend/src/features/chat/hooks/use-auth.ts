/**
 * Auth Hook
 * 
 * Amplify Auth (Cognito) との統合を提供する React Hook。
 * AgentCore Runtime への認証用 JWT トークンを管理。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  SignInInput,
  SignUpInput,
} from 'aws-amplify/auth';
import { isAuthConfigValid } from '@/shared/lib/config';

export interface User {
  userId: string;
  username: string;
  email?: string;
  tenantId?: string;
  groups?: string[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
}

export interface UseAuthReturn extends AuthState {
  /** サインイン */
  login: (email: string, password: string) => Promise<void>;
  /** サインアウト */
  logout: () => Promise<void>;
  /** サインアップ */
  register: (email: string, password: string) => Promise<void>;
  /** サインアップ確認 (確認コード) */
  confirmRegistration: (email: string, code: string) => Promise<void>;
  /** JWT トークン取得 */
  getAccessToken: () => Promise<string | null>;
  /** ID トークン取得 (カスタムクレーム含む) */
  getIdToken: () => Promise<string | null>;
  /** 認証状態を更新 */
  refreshAuth: () => Promise<void>;
  /** エラーをクリア */
  clearError: () => void;
}

/**
 * 認証 Hook
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });
  
  const initialized = useRef(false);

  /**
   * 現在のユーザー情報を取得
   */
  const fetchUser = useCallback(async (): Promise<User | null> => {
    // Amplify 認証が設定されていない場合はスキップ
    if (!isAuthConfigValid()) {
      return null;
    }

    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      // ID トークンからカスタムクレームを取得
      const idToken = session.tokens?.idToken;
      const claims = idToken?.payload;

      return {
        userId: currentUser.userId,
        username: currentUser.username,
        email: claims?.email as string | undefined,
        tenantId: claims?.['custom:tenant_id'] as string | undefined,
        groups: claims?.['cognito:groups'] as string[] | undefined,
      };
    } catch {
      return null;
    }
  }, []);

  /**
   * 認証状態を更新
   */
  const refreshAuth = useCallback(async () => {
    // Amplify 認証が設定されていない場合は未認証として扱う
    if (!isAuthConfigValid()) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const user = await fetchUser();
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Authentication failed'),
      });
    }
  }, [fetchUser]);

  // 初期化時に認証状態をチェック (一度だけ)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    
    // 少し遅延して Amplify 初期化を待つ
    const timer = setTimeout(() => {
      refreshAuth();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [refreshAuth]);

  /**
   * サインイン
   */
  const login = useCallback(async (email: string, password: string) => {
    if (!isAuthConfigValid()) {
      throw new Error('Amplify Auth is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const input: SignInInput = {
        username: email,
        password,
      };

      const result = await signIn(input);

      if (result.isSignedIn) {
        await refreshAuth();
      } else {
        // MFA などの追加ステップが必要な場合
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: new Error(`Additional step required: ${result.nextStep.signInStep}`),
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Sign in failed'),
      }));
      throw error;
    }
  }, [refreshAuth]);

  /**
   * サインアウト
   */
  const logout = useCallback(async () => {
    if (!isAuthConfigValid()) {
      throw new Error('Amplify Auth is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await signOut();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Sign out failed'),
      }));
      throw error;
    }
  }, []);

  /**
   * サインアップ
   */
  const register = useCallback(async (email: string, password: string) => {
    if (!isAuthConfigValid()) {
      throw new Error('Amplify Auth is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const input: SignUpInput = {
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      };

      await signUp(input);
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Sign up failed'),
      }));
      throw error;
    }
  }, []);

  /**
   * サインアップ確認
   */
  const confirmRegistration = useCallback(async (email: string, code: string) => {
    if (!isAuthConfigValid()) {
      throw new Error('Amplify Auth is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Confirmation failed'),
      }));
      throw error;
    }
  }, []);

  /**
   * アクセストークン取得
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!isAuthConfigValid()) {
      return null;
    }

    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * ID トークン取得
   */
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!isAuthConfigValid()) {
      return null;
    }

    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    login,
    logout,
    register,
    confirmRegistration,
    getAccessToken,
    getIdToken,
    refreshAuth,
    clearError,
  };
}
