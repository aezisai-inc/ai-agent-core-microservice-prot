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
import { isConfigValid } from '@/shared/lib/config';

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
    // Amplify が設定されていない場合はスキップ
    if (!isConfigValid()) {
      console.log('[useAuth] Config not valid, skipping fetchUser');
      return null;
    }

    try {
      console.log('[useAuth] Fetching current user...');
      const currentUser = await getCurrentUser();
      console.log('[useAuth] Current user:', currentUser);
      
      const session = await fetchAuthSession();
      console.log('[useAuth] Session obtained:', !!session.tokens);
      
      // ID トークンからカスタムクレームを取得
      const idToken = session.tokens?.idToken;
      const claims = idToken?.payload;

      const user: User = {
        userId: currentUser.userId,
        username: currentUser.username,
        email: claims?.email as string | undefined,
        tenantId: claims?.['custom:tenant_id'] as string | undefined,
        groups: claims?.['cognito:groups'] as string[] | undefined,
      };
      
      console.log('[useAuth] User fetched successfully:', user.userId);
      return user;
    } catch (error) {
      console.log('[useAuth] Error fetching user:', error);
      return null;
    }
  }, []);

  /**
   * 認証状態を更新
   */
  const refreshAuth = useCallback(async () => {
    console.log('[useAuth] Refreshing auth state...');
    
    // Amplify が設定されていない場合は未認証として扱う
    if (!isConfigValid()) {
      console.log('[useAuth] Config not valid, setting unauthenticated');
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
      console.log('[useAuth] Setting auth state, user:', !!user);
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[useAuth] Error refreshing auth:', error);
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
    
    console.log('[useAuth] Initial auth check...');
    
    // 少し遅延して Amplify 初期化を待つ
    const timer = setTimeout(() => {
      refreshAuth();
    }, 200);
    
    return () => clearTimeout(timer);
  }, [refreshAuth]);

  /**
   * サインイン
   */
  const login = useCallback(async (email: string, password: string) => {
    console.log('[useAuth] Attempting login for:', email);
    
    if (!isConfigValid()) {
      throw new Error('Amplify is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const input: SignInInput = {
        username: email,
        password,
      };

      console.log('[useAuth] Calling signIn...');
      const result = await signIn(input);
      console.log('[useAuth] SignIn result:', result);

      if (result.isSignedIn) {
        console.log('[useAuth] Sign in successful, fetching user...');
        
        // 少し待ってからユーザー情報を取得
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const user = await fetchUser();
        console.log('[useAuth] User after login:', user);
        
        setState({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          error: null,
        });
      } else {
        // MFA などの追加ステップが必要な場合
        console.log('[useAuth] Additional step required:', result.nextStep);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: new Error(`Additional step required: ${result.nextStep.signInStep}`),
        }));
      }
    } catch (error) {
      console.error('[useAuth] Login error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Sign in failed'),
      }));
      throw error;
    }
  }, [fetchUser]);

  /**
   * サインアウト
   */
  const logout = useCallback(async () => {
    console.log('[useAuth] Logging out...');
    
    if (!isConfigValid()) {
      throw new Error('Amplify is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await signOut();
      console.log('[useAuth] Signed out successfully');
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[useAuth] Logout error:', error);
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
    console.log('[useAuth] Registering:', email);
    
    if (!isConfigValid()) {
      throw new Error('Amplify is not configured');
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
      console.log('[useAuth] Registration successful');
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('[useAuth] Registration error:', error);
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
    console.log('[useAuth] Confirming registration:', email);
    
    if (!isConfigValid()) {
      throw new Error('Amplify is not configured');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      console.log('[useAuth] Registration confirmed');
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('[useAuth] Confirmation error:', error);
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
    if (!isConfigValid()) {
      return null;
    }

    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch (error) {
      console.error('[useAuth] Error getting access token:', error);
      return null;
    }
  }, []);

  /**
   * ID トークン取得
   */
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!isConfigValid()) {
      return null;
    }

    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch (error) {
      console.error('[useAuth] Error getting ID token:', error);
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
