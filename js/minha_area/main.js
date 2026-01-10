const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes', // 'mes', 'semana', 'ano'

    init: async function() {
        console.log("Minha Área Iniciada");
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);
        
        // Permissão Admin
        await this.setupAdminAccess();
        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        // Popula os Selects de Ano/Mês
        this.popularSeletoresIniciais();

        // Inicia
        this.mudarAba('diario');
    },

    isAdmin: function() {
        return ['GESTORA', 'AUDITORA', 'ADMIN'].includes(this.usuario.funcao) || this.usuario.perfil === 'admin' || this.usuario.id == 1;
    },

    setupAdminAccess: async function() {
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            const select = document.getElementById('admin-user-selector');
            if (container && select) {
                container.classList.remove('hidden');
                try {
                    const { data: users, error } = await Sistema.supabase
                        .from('usuarios')
                        .select('id, nome')
                        .eq('ativo', true)
                        .order('nome');

                    if (!error && users) {
                        let options = `<option value="" disabled selected>👉 Selecionar Colaboradora...</option>`;
                        users.forEach(u => {
                            if (u.id !== this.usuario.id) options += `<option value="${u.id}">${u.nome}</option>`;
                        });
                        select.innerHTML = options;
                    }
                } catch (e) { console.error(e); }
            }
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        if (!novoId) return;
        this.usuarioAlvoId = parseInt(novoId);
        this.atualizarTudo();
    },

    getUsuarioAlvo: function() {
        return this.usuarioAlvoId;
    },

    // --- LOGICA DE SELETORES E DATAS ---

    popularSeletoresIniciais: function() {
        // Popula Ano (Ano atual +/- 2 anos)
        const anoSelect = document.getElementById('sel-ano');
        const anoAtual = new Date().getFullYear();
        let htmlAnos = '';
        for (let i = anoAtual + 1; i >= anoAtual - 2; i--) {
            htmlAnos += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
        }
        if(anoSelect) anoSelect.innerHTML = htmlAnos;

        // Seleciona o Mês Atual
        const mesSelect = document.getElementById('sel-mes');
        const mesAtual = new Date().getMonth();
        if(mesSelect) mesSelect.value = mesAtual;
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        
        // Estilo dos Botões
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        // Visibilidade dos Seletores
        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSubAno = document.getElementById('sel-subperiodo-ano');

        // Reset visibility
        if(selMes) selMes.classList.remove('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');

        if (tipo === 'semana') {
            // Mostra: Ano, Mês, Semana
            if(selSemana) selSemana.classList.remove('hidden');
        } else if (tipo === 'ano') {
            // Mostra: Ano, Sub-periodo (Esconde Mês)
            if(selMes) selMes.classList.add('hidden');
            if(selSubAno) selSubAno.classList.remove('hidden');
        }
        // Se tipo === 'mes', o padrão (Ano + Mês) já está ok

        this.atualizarTudo();
    },

    getDatasFiltro: function() {
        // Recupera valores dos selects
        const ano = parseInt(document.getElementById('sel-ano').value);
        const mes = parseInt(document.getElementById('sel-mes').value); // 0 a 11
        
        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            // Do dia 1 ao último dia do mês selecionado
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
        
        } else if (this.filtroPeriodo === 'semana') {
            const semanaIndex = parseInt(document.getElementById('sel-semana').value); // 1 a 5
            
            // Lógica simples de semana: divide o mês em blocos de 7 dias (ou resto)
            // Semana 1: 1-7, S2: 8-14, S3: 15-21, S4: 22-28, S5: 29-Fim
            const diaInicio = (semanaIndex - 1) * 7 + 1;
            let diaFim = diaInicio + 6;
            
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
            if (diaFim > ultimoDiaMes) diaFim = ultimoDiaMes;
            
            // Se a semana começar depois do fim do mês (ex: Fev não tem dia 30), ajusta
            if (diaInicio > ultimoDiaMes) {
                inicio = new Date(ano, mes, ultimoDiaMes);
                fim = new Date(ano, mes, ultimoDiaMes);
            } else {
                inicio = new Date(ano, mes, diaInicio);
                fim = new Date(ano, mes, diaFim);
            }

        } else if (this.filtroPeriodo === 'ano') {
            const sub = document.getElementById('sel-subperiodo-ano').value;
            
            if (sub === 'full') {
                inicio = new Date(ano, 0, 1);
                fim = new Date(ano, 11, 31);
            } else if (sub.startsWith('S')) { // Semestres
                if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); } // Jan-Jun
                else { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); } // Jul-Dez
            } else if (sub.startsWith('T')) { // Trimestres
                const tri = parseInt(sub.replace('T', '')); // 1, 2, 3, 4
                const mesInicio = (tri - 1) * 3;
                const mesFim = mesInicio + 3;
                inicio = new Date(ano, mesInicio, 1);
                fim = new Date(ano, mesFim, 0);
            }
        }

        // Formata para YYYY-MM-DD (ajusta fuso horário para não perder o dia)
        // Usa UTC para garantir a string correta
        const fmt = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    atualizarTudo: function() {
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

    carregarDadosAba: function(abaId) {
        if (this.isAdmin() && !this.usuarioAlvoId) return;

        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});