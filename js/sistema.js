// js/sistema.js

console.log("Sistema: Inicializando...");

// 1. Verificação de Segurança das Credenciais (vindas do config.js)
if (typeof SUPABASE_URL === 'undefined' || (typeof SUPABASE_ANON_KEY === 'undefined' && typeof SUPABASE_KEY === 'undefined')) {
    console.error("CRÍTICO: Variáveis de configuração (URL/KEY) não encontradas. Verifique se o js/config.js está carregado antes do sistema.js.");
    alert("Erro de Configuração: Credenciais do Banco de Dados não encontradas.");
}

// 2. Inicialização do Cliente Supabase
// Utilizamos uma função auto-executável para não poluir o escopo global com variáveis temporárias
(function() {
    try {
        // Tenta pegar a chave correta (suporta os dois nomes comuns)
        const dbUrl = SUPABASE_URL;
        const dbKey = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : SUPABASE_KEY;

        // Verifica se 'supabase' existe no window (carregado pelo CDN)
        if (typeof window.supabase === 'undefined') {
            throw new Error("Biblioteca Supabase (CDN) não foi carregada. Verifique o <head> do HTML.");
        }

        // CENÁRIO A: A variável 'supabase' ainda é a Biblioteca (tem createClient)
        // Isso é o esperado no primeiro load. Vamos inicializar e SOBRESCREVER.
        if (typeof window.supabase.createClient === 'function') {
            console.log("Sistema: Conectando ao Supabase...");
            // AQUI ESTÁ A MÁGICA: Sobrescrevemos a 'fábrica' pelo 'cliente'
            window.supabase = window.supabase.createClient(dbUrl, dbKey);
        }

        // CENÁRIO B: Verificação final
        // Se agora 'supabase' tem o método .from, significa que é um cliente válido
        if (window.supabase && typeof window.supabase.from === 'function') {
            console.log("Sistema: Conexão estabelecida com sucesso.");
        } else {
            throw new Error("Falha ao criar instância do cliente Supabase.");
        }

    } catch (erro) {
        console.error("Sistema: Erro Fatal na Inicialização:", erro);
        // Opcional: Mostrar erro na tela para o usuário não ficar esperando
        document.body.innerHTML += `<div style="position:fixed;top:0;left:0;width:100%;background:red;color:white;text-align:center;padding:10px;z-index:9999">Erro de Conexão: ${erro.message}</div>`;
    }
})();

// Funções Globais Auxiliares (se houver necessidade futura)
window.Sistema = {
    checkAuth: function() {
        const session = localStorage.getItem('usuario_logado'); // ou supabase.auth.session()
        if (!session) {
            console.warn("Usuário não logado");
            // window.location.href = 'index.html'; // Descomentar para forçar login
        }
        return JSON.parse(session || '{}');
    }
};