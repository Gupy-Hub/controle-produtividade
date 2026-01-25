/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Minha Área (Com Visão Geral Habilitada)
*/

const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        await this.setupAdminAccess();
        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        
        this.atualizarTudo();
        this.mudarAba('diario');
    },

    isAdmin: function() {
        return ['GESTORA', 'AUDITORA', 'ADMINISTRADOR', 'ADMIN'].includes(this.usuario.funcao) || this.usuario.perfil === 'admin' || this.usuario.id == 1;
    },

    setupAdminAccess: async function() {
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            if (container) container.classList.remove('hidden');
        }
    },

    // --- ATUALIZAÇÃO 1: Opção "Visão Geral" no Select ---
    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return;

        const select = document.getElementById('admin-user-selector');
        if (!select) return;

        const { inicio, fim } = this.getDatasFiltro();

        try {
            // Busca IDs com produção
            const { data: prodData, error: prodError } = await Sistema.supabase
                .from('producao')
                .select('usuario_id')
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            if (prodError) throw prodError;

            const idsComDados = [...new Set(prodData.map(p => p.usuario_id))];

            if (idsComDados.length === 0) {
                select.innerHTML = '<option value="" selected>🚫 Ninguém com dados neste período</option>';
                return;
            }

            const { data: users, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome')
                .in('id', idsComDados)
                .eq('ativo', true)
                .order('nome');

            if (userError) throw userError;

            // Opção Padrão alterada para "Visão Geral"
            let options = `<option value="" ${!this.usuarioAlvoId ? 'selected' : ''}>👥 Visão Geral da Equipe</option>`;
            
            users.forEach(u => {
                if (u.id !== this.usuario.id) {
                    const isSelected = (u.id == this.usuarioAlvoId);
                    options += `<option value="${u.id}" ${isSelected ? 'selected' : ''}>${u.nome}</option>`;
                }
            });

            select.innerHTML = options;

        } catch (e) {
            console.error("Erro ao atualizar lista de assistentes:", e);
        }
    },

    // --- ATUALIZAÇÃO 2: Aceita ID nulo (Geral) ---
    mudarUsuarioAlvo: function(novoId) {
        // Se novoId for vazio, definimos como null (Visão Geral)
        this.usuarioAlvoId = novoId ? parseInt(novoId) : null;
        
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    getUsuarioAlvo: function() { return this.usuarioAlvoId; },

    popularSeletoresIniciais: function() {
        const anoSelect = document.getElementById('sel-ano');
        const anoAtual = new Date().getFullYear();
        let htmlAnos = '';
        for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
            htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
        }
        if(anoSelect) anoSelect.innerHTML = htmlAnos;
        
        const mesSelect = document.getElementById('sel-mes');
        const mesAtual = new Date().getMonth();
        if(mesSelect) mesSelect.value = mesAtual;
    },

    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano').value,
            mes: document.getElementById('sel-mes').value,
            semana: document.getElementById('sel-semana').value,
            sub: document.getElementById('sel-subperiodo-ano').value
        };
        localStorage.setItem('ma_filtro_state', JSON.stringify(estado));
        this.atualizarTudo();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('ma_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                if(document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
                if(document.getElementById('sel-semana')) document.getElementById('sel-semana').value = s.semana;
                if(document.getElementById('sel-subperiodo-ano')) document.getElementById('sel-subperiodo-ano').value = s.sub;
                
                this.mudarPeriodo(s.tipo, false);
                return;
            } catch(e) { console.error("Erro ao ler estado salvo", e); }
        }
        this.mudarPeriodo('mes', false);
    },

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSubAno = document.getElementById('sel-subperiodo-ano');

        if(selMes) selMes.classList.remove('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');

        if (tipo === 'semana') {
            if(selSemana) selSemana.classList.remove('hidden');
        } else if (tipo === 'ano') {
            if(selMes) selMes.classList.add('hidden');
            if(selSubAno) selSubAno.classList.remove('hidden');
        }

        if(salvar) this.salvarEAtualizar();
    },

    getDatasFiltro: function() {
        const ano = parseInt(document.getElementById('sel-ano').value);
        const mes = parseInt(document.getElementById('sel-mes').value);
        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
        } else if (this.filtroPeriodo === 'semana') {
            const semanaIndex = parseInt(document.getElementById('sel-semana').value);
            let current = new Date(ano, mes, 1);
            
            if (semanaIndex > 1) {
                while (current.getDay() !== 0) current.setDate(current.getDate() + 1);
                current.setDate(current.getDate() + (semanaIndex - 2) * 7);
            }
            
            inicio = new Date(current);
            fim = new Date(current);
            while (fim.getDay() !== 6) fim.setDate(fim.getDate() + 1);
            
            const ultimoDiaMes = new Date(ano, mes + 1, 0);
            if (inicio.getMonth() !== mes) { inicio = ultimoDiaMes; fim = ultimoDiaMes; } 
            else { if (fim > ultimoDiaMes) fim = ultimoDiaMes; }
        } else if (this.filtroPeriodo === 'ano') {
            const sub = document.getElementById('sel-subperiodo-ano').value;
            if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
            else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
            else if (sub === 'S2') { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
            else if (sub.startsWith('T')) {
                const tri = parseInt(sub.replace('T', ''));
                inicio = new Date(ano, (tri - 1) * 3, 1);
                fim = new Date(ano, (tri - 1) * 3 + 3, 0);
            }
        }

        const fmt = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    atualizarTudo: function() {
        this.atualizarListaAssistentes();
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');
        this.carregarDadosAba(abaId);
    },

    // --- ATUALIZAÇÃO 3: Permite carregar sem ID selecionado (para Comparativo) ---
    carregarDadosAba: function(abaId) {
        // Removemos a trava global. Cada arquivo JS (geral.js, comparativo.js)
        // decide se precisa de ID obrigatório ou não.
        
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});