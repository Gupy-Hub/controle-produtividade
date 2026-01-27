/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador de Filtros (Corrigido: Semana Recortada pelo Mês)
   REGRA: Semana de Seg-Dom, mas nunca exibe dias do mês anterior.
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

        this.popularSeletoresFixos();
        this.carregarEstadoSalvo();
        this.atualizarInterfaceFiltros();
        
        if (this.filtroPeriodo === 'semana') {
            this.popularSemanasDoMes();
        }

        this.atualizarTudo();

        // Listeners
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

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        this.atualizarInterfaceFiltros();
        if (tipo === 'semana') this.popularSemanasDoMes();
        this.salvarEAtualizar();
    },

    atualizarInterfaceFiltros: function() {
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                btn.className = (t === this.filtroPeriodo) 
                    ? "px-3 py-1.5 text-xs font-bold rounded shadow-sm text-blue-600 bg-white border border-blue-200 transition-all"
                    : "px-3 py-1.5 text-xs font-bold rounded text-slate-500 hover:bg-slate-100 transition-all";
            }
        });

        const elMes = document.getElementById('sel-mes');
        const elSemana = document.getElementById('sel-semana');
        const elSubAno = document.getElementById('sel-subperiodo-ano');

        if(elMes) elMes.classList.add('hidden');
        if(elSemana) elSemana.classList.add('hidden');
        if(elSubAno) elSubAno.classList.add('hidden');

        if (this.filtroPeriodo === 'mes') {
            if(elMes) elMes.classList.remove('hidden');
        } 
        else if (this.filtroPeriodo === 'semana') {
            if(elMes) elMes.classList.remove('hidden');
            if(elSemana) elSemana.classList.remove('hidden');
        } 
        else if (this.filtroPeriodo === 'ano') {
            if(elSubAno) elSubAno.classList.remove('hidden');
        }
    },

    popularSeletoresFixos: function() {
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth();

        const elAno = document.getElementById('sel-ano');
        if(elAno) {
            elAno.innerHTML = `
                <option value="${anoAtual}">${anoAtual}</option>
                <option value="${anoAtual-1}">${anoAtual-1}</option>
                <option value="${anoAtual+1}">${anoAtual+1}</option>
            `;
            elAno.value = anoAtual;
        }

        const elMes = document.getElementById('sel-mes');
        if(elMes) elMes.value = mesAtual;
    },

    // --- CORREÇÃO DA LÓGICA DE SEMANAS ---
    popularSemanasDoMes: function() {
        const elSemana = document.getElementById('sel-semana');
        const elAno = document.getElementById('sel-ano');
        const elMes = document.getElementById('sel-mes');
        
        if (!elSemana || !elAno || !elMes) return;

        const ano = parseInt(elAno.value);
        const mes = parseInt(elMes.value); 

        // Limites do Mês
        const primeiroDiaMes = new Date(ano, mes, 1);
        const ultimoDiaMes = new Date(ano, mes + 1, 0);

        // Encontrar a Segunda-Feira da primeira semana (pode cair no mês anterior)
        // Dia da semana: 0 (Dom) ... 6 (Sab) -> ISO: 1 (Seg) ... 7 (Dom)
        // Ajuste: Segunda = 1.
        let diaSemana = primeiroDiaMes.getDay(); 
        if (diaSemana === 0) diaSemana = 7; // Domingo vira 7 para facilitar conta da Segunda (1)
        
        let segundaFeiraAtual = new Date(primeiroDiaMes);
        segundaFeiraAtual.setDate(primeiroDiaMes.getDate() - (diaSemana - 1));

        let html = '';
        let count = 1;

        // Loop enquanto a segunda-feira ainda estiver dentro do mês 
        // OU se a semana começou antes mas termina dentro do mês
        while (segundaFeiraAtual <= ultimoDiaMes) {
            const domingoAtual = new Date(segundaFeiraAtual);
            domingoAtual.setDate(segundaFeiraAtual.getDate() + 6);

            // Se a semana inteira já passou do fim do mês (caso raro de loop), para.
            if (segundaFeiraAtual > ultimoDiaMes) break;

            // --- RECORTE (CLAMP) ---
            // Início: O maior entre (Segunda da Semana) e (1º do Mês)
            const inicioReal = segundaFeiraAtual < primeiroDiaMes ? primeiroDiaMes : segundaFeiraAtual;
            
            // Fim: O menor entre (Domingo da Semana) e (Último do Mês)
            // (Opcional: se quiser mostrar até o dia 5 do mês seguinte, remova o clamp do fim. 
            //  Mas por consistência com "Mês Anterior", geralmente travamos o mês todo).
            const fimReal = domingoAtual > ultimoDiaMes ? ultimoDiaMes : domingoAtual;

            // Formatação
            const fmt = d => d.toISOString().split('T')[0];
            const fmtBr = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            // Só adiciona se houver dias válidos (Safety check)
            if (inicioReal <= fimReal) {
                const valor = `${fmt(inicioReal)}|${fmt(fimReal)}`;
                const texto = `Semana ${count} (${fmtBr(inicioReal)} a ${fmtBr(fimReal)})`;
                html += `<option value="${valor}">${texto}</option>`;
                count++;
            }

            // Avança para próxima Segunda
            segundaFeiraAtual.setDate(segundaFeiraAtual.getDate() + 7);
        }

        elSemana.innerHTML = html;
        
        // Tenta selecionar a primeira opção por padrão se nenhuma estiver salva
        if (elSemana.options.length > 0 && !elSemana.value) {
            elSemana.selectedIndex = 0;
        }
    },

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
            const rawVal = document.getElementById('sel-semana').value;
            if (rawVal && rawVal.includes('|')) {
                const [i, f] = rawVal.split('|');
                return { inicio: i, fim: f };
            }
            return { inicio: fmt(new Date()), fim: fmt(new Date()) };
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

    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano')?.value,
            mes: document.getElementById('sel-mes')?.value,
            // Não salva semana específica para evitar bugs na troca de mês
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
    
    atualizarListaAssistentes: async function() {
        if (!this.isAdmin()) return;
        const select = document.getElementById('admin-user-selector');
        if (!select || select.options.length > 1) return;

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