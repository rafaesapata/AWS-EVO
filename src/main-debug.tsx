import { createRoot } from "react-dom/client";

// Debug simples para verificar se React está carregando
function DebugApp() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f3f4f6', 
      padding: '2rem',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto',
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ color: '#1f2937', marginBottom: '1rem' }}>
          🔍 EVO UDS - Debug Mode
        </h1>
        
        <div style={{ marginBottom: '1rem' }}>
          <p><strong>Status:</strong> React carregando ✅</p>
          <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
          <p><strong>Environment:</strong> {import.meta.env.MODE}</p>
        </div>

        <div style={{ 
          backgroundColor: '#f9fafb', 
          padding: '1rem', 
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          <h3>Environment Variables:</h3>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>
            {JSON.stringify({
              VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
              VITE_AWS_REGION: import.meta.env.VITE_AWS_REGION,
              VITE_AWS_USER_POOL_ID: import.meta.env.VITE_AWS_USER_POOL_ID,
              VITE_AWS_USER_POOL_CLIENT_ID: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID,
            }, null, 2)}
          </pre>
        </div>

        <button 
          onClick={() => {
            console.log("Button clicked - JavaScript working!");
            alert("JavaScript está funcionando!");
          }}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Testar JavaScript
        </button>

        <div style={{ marginTop: '2rem', fontSize: '14px', color: '#6b7280' }}>
          <p>Se você está vendo esta página, o React está funcionando.</p>
          <p>Verifique o console do navegador (F12) para mais detalhes.</p>
        </div>
      </div>
    </div>
  );
}

console.log("🚀 Debug App iniciando...");
console.log("Environment:", import.meta.env.MODE);
console.log("API URL:", import.meta.env.VITE_API_BASE_URL);

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  console.log("✅ Root element found, creating React root...");
  const root = createRoot(rootElement);
  root.render(<DebugApp />);
  console.log("✅ React app rendered successfully");
} catch (error) {
  console.error("❌ Error rendering app:", error);
  document.body.innerHTML = `
    <div style="padding: 2rem; font-family: Arial, sans-serif;">
      <h1 style="color: red;">Error Loading App</h1>
      <pre>${error}</pre>
    </div>
  `;
}