const MinhaArea = {
    usuario: null,
    filtros: { tipo: 'mes', valor: null }, // Estado global dos filtros

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário (Mock ou LocalStorage)
        // Em produção, isso viria do sistema de login real
        const storedUser = localStorage.getItem('usuario_ativo');
        this.usuario = storedUser ? JSON.parse(storedUser) : { id: 1, nome: "Usuário Teste" };

        // 2. Configurar Data Inicial (Hoje)
        const dateInput = document.getElementById('filtro-data');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // 3. Iniciar na aba padrão
        this.mudarAba('diario');
    },

    mudarAba: function(abaId) {
        // UI das Abas
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        // Carregar dados da aba
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'evolucao' && this.Evolucao) this.Evolucao.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
    },

    mudarTipoFiltro: function(tipo) {
        this.filtros.tipo = tipo;
        // Ajusta a UI do filtro (Ex: esconder data se for "todos")
        const containerData = document.getElementById('filtro-valor-container');
        if (tipo === 'todos') containerData.classList.add('invisible');
        else containerData.classList.remove('invisible');
        
        this.atualizarTudo();
    },

    atualizarTudo: function() {
        // Recarrega a aba ativa com os novos filtros
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.mudarAba(id);
        }
    },

    // Helper de Datas para os submódulos
    getDatasFiltro: function() {
        const tipo = this.filtros.tipo;
        const dataRef = document.getElementById('filtro-data').value;
        const [ano, mes, dia] = dataRef.split('-').map(Number);
        
        let inicio, fim;

        if (tipo === 'dia') {
            inicio = dataRef; fim = dataRef;
        } else if (tipo === 'mes') {
            inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
            fim = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`;
        } else if (tipo === 'ano') {
            inicio = `${ano}-01-01`; fim = `${ano}-12-31`;
        } else if (tipo === 'todos') {
            inicio = '2020-01-01'; fim = '2030-12-31';
        } else {
            // Default Mês
            inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
            fim = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`;
        }
        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});