const Gestao = {
    supabase: null,
    dados: { usuarios: [], empresas: [] },

    init: async function() {
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Gestao.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        } else {
            return alert("Erro: Supabase não configurado.");
        }

        const today = new Date().toISOString().substring(0, 10);
        ['meta-date', 'assert-date', 'form-empresa-data'].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = today;
        });

        await Gestao.Equipe.carregar();
        await Gestao.Empresas.carregar();
        await Gestao.Producao.carregar();
        await Gestao.Assertividade.carregar();
        Gestao.mudarAba('equipe');
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${aba}`).classList.remove('hidden');
        document.getElementById(`btn-${aba}`).classList.add('active');
    },

    fecharModais: function() {
        document.getElementById('modal-user').classList.add('hidden');
        document.getElementById('modal-empresa').classList.add('hidden');
    }
};
document.addEventListener('DOMContentLoaded', Gestao.init);