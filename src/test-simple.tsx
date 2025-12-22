import { createRoot } from "react-dom/client";

function SimpleTest() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>🎉 Frontend AWS Funcionando!</h1>
      <p>Se você está vendo esta mensagem, o React está carregando corretamente.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
      <button onClick={() => alert('JavaScript funcionando!')}>
        Testar JavaScript
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<SimpleTest />);