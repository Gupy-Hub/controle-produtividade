/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Principal (Filtros Avançados: Mês, Semana, Ano, Trimestre)
*/

const MinhaArea = {
    usuario: null,
    usuarioAlvoId: null,
    filtroPeriodo: 'mes', // mes, semana, ano

    init: async function() {
        if (!Sistema.supabase) await Sistema.inicializar(false);
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) { window.location.href = 'index.html'; return; }
        this.usuario = JSON.parse(storedUser);
        
        await this.setupAdminAccess();

        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        this.popularSeletoresIniciais();
        
        // Carrega estado anterior ou define padrão
        this.carregarEstadoSalvo();
        
        // Renderiza a interface inicial
        this.atualizarInterfaceFiltros();
        this.atualizarTudo();

        // Listeners Globais para recarregar ao mudar selects
        document.querySelectorAll('.filtro-auto-update').forEach(el => {
            el.addEventListener('change', () => {
                this.salvarEAtualizar();
            });
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

    // --- LÓGICA DE FILTROS (VISUAL) ---
    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        this.atualizarInterfaceFiltros();
        this.salvarEAtualizar();
    },

    atualizarInterfaceFiltros: function() {
        // 1. Atualiza Botões
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if (t === this.filtroPeriodo) {
                    btn.className = "px-4 py-1.5 text-xs font-bold rounded-md bg-white text-blue-600 shadow-sm border border-blue-100 transition-all";
                } else {
                    btn.className = "px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-600 transition-all";
                }
            }
        });

        // 2. Exibe Containers Específicos
        document.getElementById('container-filtro-mes').classList.add('hidden');
        document.getElementById('container-filtro-semana').classList.add('hidden');
        document.getElementById('container-filtro-ano').classList.add('hidden');

        if (this.filtroPeriodo === 'mes') {
            document.getElementById('container-filtro-mes').classList.remove('hidden');
        } else if (this.filtroPeriodo === 'semana') {
            document.getElementById('container-filtro-semana').classList.remove('hidden');
        } else if (this.filtroPeriodo === 'ano') {
            document.getElementById('container-filtro-ano').classList.remove('hidden');
        }
    },

    popularSeletoresIniciais: function() {
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth(); // 0-11

        // 1. Popular Anos (Geral)
        const selectsAno = document.querySelectorAll('.select-ano-pop');
        const htmlAnos = `
            <option value="${anoAtual}">${anoAtual}</option>
            <option value="${anoAtual-1}">${anoAtual-1}</option>
            <option value="${anoAtual+1}">${anoAtual+1}</option>
        `;
        selectsAno.forEach(s => s.innerHTML = htmlAnos);

        // 2. Popular Meses
        const elMes = document.getElementById('sel-mes');
        if(elMes) elMes.value = mesAtual;

        // 3. Popular Semanas (ISO 8601 - Lógica Simplificada)
        const elSemana = document.getElementById('sel-semana');
        if(elSemana) {
            let htmlSem = '';
            // Gera 53 semanas genéricas
            for(let i=1; i<=53; i++) {
                htmlSem += `<option value="${i}">Semana ${i}</option>`;
            }
            elSemana.innerHTML = htmlSem;
            // Tenta selecionar a semana atual
            const currentWeek = this.getSemanaAtual();
            elSemana.value = currentWeek;
        }
    },

    getSemanaAtual: function() {
        const d = new Date();
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    },

    // --- LÓGICA DE DATAS (O CORAÇÃO DO SISTEMA) ---
    getDatasFiltro: function() {
        const fmt = (d) => d.toISOString().split('T')[0];
        
        if (this.filtroPeriodo === 'mes') {
            const ano = parseInt(document.getElementById('sel-ano').value);
            const mes = parseInt(document.getElementById('sel-mes').value);
            return { 
                inicio: fmt(new Date(ano, mes, 1)), 
                fim: fmt(new Date(ano, mes + 1, 0)) 
            };
        }
        
        else if (this.filtroPeriodo === 'semana') {
            const ano = parseInt(document.getElementById('sel-ano-semana').value);
            const semana = parseInt(document.getElementById('sel-semana').value);
            return this.getDateRangeOfWeek(semana, ano);
        }
        
        else if (this.filtroPeriodo === 'ano') {
            const ano = parseInt(document.getElementById('sel-ano-full').value);
            const tipo = document.getElementById('sel-periodo-ano').value; // ano_completo, 1_semestre, 2_semestre, 1_tri...
            
            let inicio, fim;
            
            switch(tipo) {
                case '1_semestre':
                    inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); break;
                case '2_semestre':
                    inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); break;
                case '1_trimestre':
                    inicio = new Date(ano, 0, 1); fim = new Date(ano, 2, 31); break;
                case '2_trimestre':
                    inicio = new Date(ano, 3, 1); fim = new Date(ano, 5, 30); break;
                case '3_trimestre':
                    inicio = new Date(ano, 6, 1); fim = new Date(ano, 8, 30); break;
                case '4_trimestre':
                    inicio = new Date(ano, 9, 1); fim = new Date(ano, 11, 31); break;
                default: // ano_completo
                    inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); break;
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
            mes: document.getElementById('sel-mes')?.value
            // ... outros campos podem ser salvos aqui
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
                // Restaura valores dos selects se existirem
                if(s.ano && document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(s.mes && document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
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
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); // Limpa visual antigo
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('bg-blue-600', 'text-white'));

        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        
        if(aba) aba.classList.remove('hidden');
        if(btn) {
            btn.classList.add('active');
            // Estilo ativo conforme seu padrão (se for texto azul ou fundo azul, ajuste aqui)
        }
        
        this.carregarDadosAba(abaId);
    },

    carregarDadosAba: function(abaId) {
        console.log("🔄 Carregando aba:", abaId);
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
        
        // Mantém seleção atual
        const atual = select.value;
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

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});