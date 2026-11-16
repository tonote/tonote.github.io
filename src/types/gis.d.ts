declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        requestAccessToken(overrideConfig?: { prompt?: string; login_hint?: string }): void;
      }
      interface TokenClientConfig {
        client_id: string;
        scope: string;
        include_granted_scopes?: boolean;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type: string; message: string }) => void;
      }
      interface TokenResponse {
        access_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
        error?: string;
        error_description?: string;
      }
      function initTokenClient(config: TokenClientConfig): TokenClient;
    }
  }
}
