const Gestao = {
    supabase: null,
    dados: {
        usuarios: [],
        empresas: []
    },

    init: async function() {
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Gestao.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = Gestao.supabase; // Compatibilidade com códigos legados se houver
        } else {
            console.error("Configuração do Supabase não encontrada.");
            alert("Erro de configuração.");
            return;
        }

        // Define datas padrão (Hoje)
        const today = new Date().toISOString().substring(0, 10);
        ['meta-date', 'assert-date', 'form-empresa-data'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = today;
        });

        // Carrega dados iniciais
        await Gestao.Equipe.carregar();
        await Gestao.Empresas.carregar();
        await Gestao.Producao.carregar(); // Carrega histórico inicial se possível
        await Gestao.Assertividade.carregar();

        // Inicia na aba Equipe
        Gestao.mudarAba('equipe');
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        const content = document.getElementById(`tab-${aba}`);
        const btn = document.getElementById(`btn-${aba}`);
        
        if(content) content.classList.remove('hidden');
        if(btn) btn.classList.add('active');
    },

    fecharModais: function() {
        document.getElementById('modal-user').classList.add('hidden');
        document.getElementById('modal-empresa').classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', Gestao.init);