/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador de Filtros (Corrigido: Semana vinculada ao Mês)
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

        if (!this.isAdmin()) {
            this.usuarioAlvoId = this.usuario.id;
        }

        // 4. Popula Selects Iniciais
        this.popularSeletoresFixos();
        
        // 5. Restaura Estado Salvo ou Define Padrão
        this.carregarEstadoSalvo();
        
        // 6. Renderiza Interface e Atualiza
        this.atualizarInterfaceFiltros();
        
        // Se estiver em modo semana, garante que as semanas do mês atual sejam geradas
        if (this.filtroPeriodo === 'semana') {
            this.popularSemanasDoMes();
        }

        this.atualizarTudo();

        // --- LISTENERS DE EVENTOS ---
        
        // Ao mudar Ano ou Mês -> Se for semana, recarrega a lista de semanas
        ['sel-ano', 'sel-mes'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.addEventListener('change', () => {
                    if (this.filtroPeriodo === 'semana') {
                        this.popularSemanasDoMes();
                    }
                    this.salvarEAtualizar();
                });
            }
        });

        // Ao mudar Semana ou Subperíodo -> Apenas salva e atualiza
        ['sel-semana', 'sel-subperiodo-ano'].forEach(id => {
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
        
        if (tipo === 'semana') {
            this.popularSemanasDoMes(); // Gera as semanas do mês atual
        }
        
        this.salvarEAtualizar();
    },

    atualizarInterfaceFiltros: function() {
        // 1. Atualiza Botões (Visual)
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if (t === this.filtroPeriodo) {
                    btn.className = "px-3 py-1.5 text-xs font-bold rounded shadow-sm text-blue-600 bg-white border border-blue-200 transition-all";
                } else {
                    btn.className = "px-3 py-1.5 text-xs font-bold rounded text-slate-500 hover:bg-slate-100 transition-all";
                }
            }
        });

        // 2. Controle de Visibilidade dos Selects
        const elMes = document.getElementById('sel-mes');
        const elSemana = document.getElementById('sel-semana');
        const elSubAno = document.getElementById('sel-subperiodo-ano');

        if(elMes) elMes.classList.add('hidden');
        if(elSemana) elSemana.classList.add('hidden');
        if(elSubAno) elSubAno.classList.add('hidden');

        if (this.filtroPeriodo === 'mes') {
            // Mês: Mostra Ano + Mês
            if(elMes) elMes.classList.remove('hidden');
        } 
        else if (this.filtroPeriodo === 'semana') {
            // Semana: Mostra Ano + Mês (para filtrar) + Semana
            if(elMes) elMes.classList.remove('hidden');
            if(elSemana) elSemana.classList.remove('hidden');
        } 
        else if (this.filtroPeriodo === 'ano') {
            // Ano: Mostra Ano + Subperíodo (Trimestre/Semestre)
            if(elSubAno) elSubAno.classList.remove('hidden');
        }
    },

    popularSeletoresFixos: function() {
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth();

        // 1. Popular Ano (Único)
        const elAno = document.getElementById('sel-ano');
        if(elAno) {
            elAno.innerHTML = `
                <option value="${anoAtual}">${anoAtual}</option>
                <option value="${anoAtual-1}">${anoAtual-1}</option>
                <option value="${anoAtual+1}">${anoAtual+1}</option>
            `;
            elAno.value = anoAtual;
        }

        // 2. Popular Mês
        const elMes = document.getElementById('sel-mes');
        if(elMes) elMes.value = mesAtual;
    },

    // --- LÓGICA INTELIGENTE DE SEMANAS DO MÊS ---
    popularSemanasDoMes: function() {
        const elSemana = document.getElementById('sel-semana');
        const elAno = document.getElementById('sel-ano');
        const elMes = document.getElementById('sel-mes');
        
        if (!elSemana || !elAno || !elMes) return;

        const ano = parseInt(elAno.value);
        const mes = parseInt(elMes.value); // 0 = Jan

        // 1. Encontrar a primeira segunda-feira da semana que contém o dia 1 do mês
        const primeiroDiaMes = new Date(ano, mes, 1);
        const diaSemana = primeiroDiaMes.getDay(); // 0 (Dom) a 6 (Sab)
        
        // Ajuste para começar na Segunda (ISO)
        // Se for Dom (0), volta 6 dias. Se for Seg (1), volta 0. Se for Ter (2), volta 1...
        const diffToMonday = diaSemana === 0 ? 6 : diaSemana - 1;
        
        let currentMonday = new Date(primeiroDiaMes);
        currentMonday.setDate(primeiroDiaMes.getDate() - diffToMonday);

        const ultimoDiaMes = new Date(ano, mes + 1, 0);
        
        let html = '';
        let count = 1;

        // Loop: Enquanto a segunda-feira for antes ou igual ao último dia do mês
        while (currentMonday <= ultimoDiaMes) {
            const start = new Date(currentMonday);
            const end = new Date(currentMonday);
            end.setDate(end.getDate() + 6);

            // Formatação para valor e texto
            const fmt = d => d.toISOString().split('T')[0];
            const fmtBr = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            const valor = `${fmt(start)}|${fmt(end)}`;
            const texto = `Semana ${count} (${fmtBr(start)} a ${fmtBr(end)})`;

            html += `<option value="${valor}">${texto}</option>`;

            // Avança para a próxima semana
            currentMonday.setDate(currentMonday.getDate() + 7);
            count++;
        }

        elSemana.innerHTML = html;
        
        // Tenta manter a seleção anterior se possível, senão pega a primeira
        // (Lógica opcional, aqui pega a primeira por padrão para simplificar)
    },

    // --- OBTENÇÃO DAS DATAS PARA FILTRAGEM ---
    getDatasFiltro: function() {
        const fmt = (d) => d.toISOString().split('T')[0];
        const ano = parseInt(document.getElementById('sel-ano').value);

        if (this.filtroPeriodo === 'mes') {
            const mes = parseInt(document.getElementById('sel-mes').value);
            return { 
                inicio: fmt(new Date(ano, mes, 1)), 
                fim: fmt(new Date(ano, mes + 1, 0)) 
            };
        }
        
        else if (this.filtroPeriodo === 'semana') {
            // O value do select já é "2025-01-01|2025-01-07"
            const rawVal = document.getElementById('sel-semana').value;
            if (rawVal && rawVal.includes('|')) {
                const [i, f] = rawVal.split('|');
                return { inicio: i, fim: f };
            } else {
                // Fallback de segurança
                return { inicio: fmt(new Date()), fim: fmt(new Date()) };
            }
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
                default:   inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); break;
            }
            return { inicio: fmt(inicio), fim: fmt(fim) };
        }
    },

    // --- PERSISTÊNCIA E ATUALIZAÇÃO ---
    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano')?.value,
            mes: document.getElementById('sel-mes')?.value,
            // Não salvamos a semana específica para evitar bugs ao mudar de mês
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
                if(s.sub && document.getElementById('sel-subperiodo-ano')) document.getElementById('sel-subperiodo-ano').value = s.sub;
            } catch(e) {}
        }
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

    carregarDadosAba: function(abaId) {
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    },
    
    // --- ADMIN ---
    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return;
        const select = document.getElementById('admin-user-selector');
        if (!select) return;
        if(select.options.length > 1) return; 

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