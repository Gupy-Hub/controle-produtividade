/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Principal (Compatível com HTML Simplificado)
*/

const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes', // mes, semana, ano

    init: async function() {
        // 1. Inicializa Supabase
        if (!Sistema.supabase) await Sistema.inicializar(false);
        
        // 2. Verifica Sessão
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) { window.location.href = 'index.html'; return; }
        this.usuario = JSON.parse(storedUser);
        
        // 3. Configura Acesso Admin
        await this.setupAdminAccess();

        // Se não for admin, trava no próprio ID
        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        // 4. Popula Selects e Restaura Estado
        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        
        // 5. Renderiza Interface
        this.atualizarInterfaceFiltros();
        this.atualizarTudo();

        // Listeners para salvar estado ao mudar filtro
        ['sel-ano', 'sel-mes', 'sel-semana', 'sel-subperiodo-ano'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', () => this.salvarEAtualizar());
        });
    },

    isAdmin: function() {
        const p = (this.usuario.perfil || '').toUpperCase();
        const f = (this.usuario.funcao || '').toUpperCase();
        const id = parseInt(this.usuario.id);
        return p === 'ADMIN' || p === 'ADMINISTRADOR' || f.includes('GESTOR') || f.includes('AUDITOR') || id === 1 || id === 1000;
    },

    setupAdminAccess: async function() {
        if (this.isAdmin()) {
            const container = document.getElementById('admin-selector-container');
            if (container) container.classList.remove('hidden');
        }
    },

    // --- VISUAL DOS FILTROS ---
    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        this.atualizarInterfaceFiltros();
        this.salvarEAtualizar();
    },

    atualizarInterfaceFiltros: function() {
        // 1. Atualiza Estilo dos Botões
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if (t === this.filtroPeriodo) {
                    btn.className = "px-2 py-1 text-xs font-semibold rounded shadow-sm text-blue-600 bg-white transition border border-blue-100";
                } else {
                    btn.className = "px-2 py-1 text-xs font-semibold rounded text-slate-500 hover:bg-white hover:text-slate-700 transition";
                }
            }
        });

        // 2. Exibe/Oculta Selects (Diretamente nos elementos, sem container)
        const elMes = document.getElementById('sel-mes');
        const elSemana = document.getElementById('sel-semana');
        const elSubAno = document.getElementById('sel-subperiodo-ano');

        if(elMes) elMes.classList.add('hidden');
        if(elSemana) elSemana.classList.add('hidden');
        if(elSubAno) elSubAno.classList.add('hidden');

        if (this.filtroPeriodo === 'mes') {
            if(elMes) elMes.classList.remove('hidden');
        } else if (this.filtroPeriodo === 'semana') {
            if(elSemana) elSemana.classList.remove('hidden');
        } else if (this.filtroPeriodo === 'ano') {
            if(elSubAno) elSubAno.classList.remove('hidden');
        }
    },

    popularSeletoresIniciais: function() {
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth();

        // Popular Ano (Único)
        const elAno = document.getElementById('sel-ano');
        if(elAno) {
            elAno.innerHTML = `
                <option value="${anoAtual}">${anoAtual}</option>
                <option value="${anoAtual-1}">${anoAtual-1}</option>
                <option value="${anoAtual+1}">${anoAtual+1}</option>
            `;
            elAno.value = anoAtual;
        }

        // Popular Mês
        const elMes = document.getElementById('sel-mes');
        if(elMes) elMes.value = mesAtual;

        // Popular Semanas
        const elSemana = document.getElementById('sel-semana');
        if(elSemana) {
            let htmlSem = '';
            for(let i=1; i<=53; i++) {
                htmlSem += `<option value="${i}">Semana ${i}</option>`;
            }
            elSemana.innerHTML = htmlSem;
            elSemana.value = this.getSemanaAtual();
        }
    },

    getSemanaAtual: function() {
        const d = new Date();
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    },

    // --- LÓGICA DE DATAS (CORRIGIDA PARA SELETORES ÚNICOS) ---
    getDatasFiltro: function() {
        const fmt = (d) => d.toISOString().split('T')[0];
        // Todos usam o mesmo seletor de ano
        const ano = parseInt(document.getElementById('sel-ano').value);

        if (this.filtroPeriodo === 'mes') {
            const mes = parseInt(document.getElementById('sel-mes').value);
            return { 
                inicio: fmt(new Date(ano, mes, 1)), 
                fim: fmt(new Date(ano, mes + 1, 0)) 
            };
        }
        
        else if (this.filtroPeriodo === 'semana') {
            const semana = parseInt(document.getElementById('sel-semana').value);
            return this.getDateRangeOfWeek(semana, ano);
        }
        
        else if (this.filtroPeriodo === 'ano') {
            const tipo = document.getElementById('sel-subperiodo-ano').value;
            let inicio, fim;
            
            switch(tipo) {
                case 'S1': inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); break;
                case 'S2': inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); break;
                case 'T1': inicio = new Date(ano, 0, 1); fim = new Date(ano, 2, 31); break;
                case 'T2': inicio = new Date(ano, 3, 1); fim = new Date(ano, 5, 30); break;
                case 'T3': inicio = new Date(ano, 6, 1); fim = new Date(ano, 8, 30); break;
                case 'T4': inicio = new Date(ano, 9, 1); fim = new Date(ano, 11, 31); break;
                default:   inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); break; // full
            }
            return { inicio: fmt(inicio), fim: fmt(fim) };
        }
    },

    getDateRangeOfWeek: function(w, y) {
        const simple = new Date(y, 0, 1 + (w - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        
        const ISOweekEnd = new Date(ISOweekStart);
        ISOweekEnd.setDate(ISOweekEnd.getDate() + 6);
        
        return { 
            inicio: ISOweekStart.toISOString().split('T')[0], 
            fim: ISOweekEnd.toISOString().split('T')[0] 
        };
    },

    // --- GERENCIAMENTO DE ESTADO ---
    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano')?.value,
            mes: document.getElementById('sel-mes')?.value,
            semana: document.getElementById('sel-semana')?.value,
            sub: document.getElementById('sel-subperiodo-ano')?.value
        };
        localStorage.setItem('ma_filtro_state', JSON.stringify(estado));
        this.atualizarTudo();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('ma_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                if (s.tipo) this.filtroPeriodo = s.tipo;
                if(s.ano && document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(s.mes && document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
                if(s.semana && document.getElementById('sel-semana')) document.getElementById('sel-semana').value = s.semana;
                if(s.sub && document.getElementById('sel-subperiodo-ano')) document.getElementById('sel-subperiodo-ano').value = s.sub;
            } catch(e) {}
        }
    },

    // --- INTEGRAÇÃO ---
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

    carregarDadosAba: function(abaId) {
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    },
    
    // Funções Admin
    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return;
        const select = document.getElementById('admin-user-selector');
        if (!select) return;
        
        if(select.options.length > 1) return; // Já carregou

        try {
            const { data, error } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome')
                .eq('ativo', true)
                .order('nome');
                
            if (!error) {
                let options = `<option value="">👥 Visão Geral da Equipe</option>`;
                data.forEach(u => {
                    if (u.id != this.usuario.id) {
                        options += `<option value="${u.id}">${u.nome}</option>`;
                    }
                });
                select.innerHTML = options;
                select.value = this.usuarioAlvoId || "";
            }
        } catch(e) {}
    },

    mudarUsuarioAlvo: function(novoId) {
        this.usuarioAlvoId = novoId ? parseInt(novoId) : null;
        this.atualizarTudo();
    },

    getUsuarioAlvo: function() { return this.usuarioAlvoId; }
};

// Inicialização segura
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});