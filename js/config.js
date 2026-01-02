// js/config.js
console.log("⚙️ A iniciar configurações e utilitários globais...");

// --- 1. CREDENCIAIS DO SUPABASE ---
const SB_URL = "https://btzdlrjqdzisvyskskeb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emRscmpxZHppc3Z5c2tza2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzIzNDEsImV4cCI6MjA4MjcwODM0MX0.k49GeqGXUP2c3wR9Jo0vJgTdYl1DZumi7s17sGArIQE";

if (typeof supabase === 'undefined') {
    console.error("ERRO CRÍTICO: Supabase não carregado.");
} else {
    window._supabase = supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Supabase conectado!");
}

// --- 2. GERENCIADOR DE DATAS GLOBAL ---
const DataGlobal = {
    // Chave para salvar no navegador
    STORAGE_KEY: 'sistema_data_ref',

    // Define a data global (espera formato DD/MM/AAAA)
    definir: function(dataString) {
        if(dataString && dataString.length === 10) {
            localStorage.setItem(this.STORAGE_KEY, dataString);
            console.log(`📅 Data Global atualizada para: ${dataString}`);
        }
    },

    // Obtém a data salva ou retorna "Ontem" como padrão se não houver nada salvo
    obter: function() {
        const salva = localStorage.getItem(this.STORAGE_KEY);
        if (salva) return salva;

        // Se não tiver data salva, define "Ontem" como padrão
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        const dia = String(ontem.getDate()).padStart(2, '0');
        const mes = String(ontem.getMonth() + 1).padStart(2, '0');
        const ano = ontem.getFullYear();
        const padrao = `${dia}/${mes}/${ano}`;
        
        this.definir(padrao); // Salva para a próxima vez
        return padrao;
    },

    // Converte DD/MM/AAAA (Visual) para AAAA-MM-DD (Banco de Dados)
    paraISO: function(dataBR) {
        if (!dataBR || dataBR.length !== 10) return null;
        const [dia, mes, ano] = dataBR.split('/');
        return `${ano}-${mes}-${dia}`;
    },

    // Converte AAAA-MM-DD (Banco) para DD/MM/AAAA (Visual)
    paraBR: function(dataISO) {
        if (!dataISO) return '';
        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;
    }
};

// --- 3. MÁSCARA DE INPUT (Digitar 01012026 -> 01/01/2026) ---
function mascaraDataGlobal(input) {
    // Remove tudo que não é número
    let v = input.value.replace(/\D/g, '');
    
    // Limita a 8 números (DDMMAAAA)
    if (v.length > 8) v = v.slice(0, 8);

    // Adiciona as barras automaticamente
    if (v.length >= 5) {
        v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
    } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{1,2})/, '$1/$2');
    }
    
    input.value = v;

    // Se a data estiver completa (10 caracteres), atualiza o estado global automaticamente
    if (v.length === 10) {
        // Se o input tiver o atributo 'data-sync="true"', atualiza a global
        if(input.dataset.sync === "true") {
            DataGlobal.definir(v);
            // Dispara evento para avisar a página que mudou (opcional, mas útil)
            input.dispatchEvent(new Event('change')); 
        }
    }
}