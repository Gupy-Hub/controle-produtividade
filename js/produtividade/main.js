// ARQUIVO: js/produtividade/main.js

window.Produtividade = window.Produtividade || {};

// Mesclamos as funções principais no objeto global existente
Object.assign(window.Produtividade, {
    supabase: null, 
    usuario: null,
    filtroPeriodo: 'mes', // Padrão

    init: async function() {
        console.log("Módulo Produtividade Iniciado");
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);

        // Reabilita o Checking: Regista ou verifica a presença do dia
        if (window.Sistema && window.Sistema.registrarAcesso) {
            await window.Sistema.registrarAcesso(this.usuario.id);
        }

        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        this.verificarStatusPresenca(); // Feedback visual do checking
        this.mudarAba('geral');
    },

    /**
     * Feedback visual para o utilizador sobre o estado do checking diário
     */
    verificarStatusPresenca: async function() {
        const hoje = new Date().toISOString().split('T')[0];
        try {
            const { data, error } = await Sistema.supabase
                .from('acessos_diarios')
                .select('id')
                .eq('usuario_id', this.usuario.id)
                .eq('data_referencia', hoje)
                .maybeSingle();

            const statusEl = document.getElementById('status-presenca-hoje');
            if (statusEl) {
                if (data) {
                    statusEl.innerHTML = '<span class="text-emerald-500 text-xs font-bold"><i class="fas fa-check-circle"></i> CHECKING REALIZADO</span>';
                } else {
                    statusEl.innerHTML = '<span class="text-amber-500 text-xs font-bold"><i class="fas fa-clock"></i> AGUARDANDO CHECKING</span>';
                }
            }
        } catch (err) {
            console.error("Erro ao verificar status de presença:", err);
        }
    },

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

        // Data Dia Atual
        const diaInput = document.getElementById('sel-data-dia');
        if(diaInput && !diaInput.value) {
            diaInput.value = new Date().toISOString().split('T')[0];
        }
    },

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        
        // Atualiza botões de interface
        ['dia', 'mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        // Alterna visibilidade dos seletores
        const selDia = document.getElementById('sel-data-dia');
        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSubAno = document.getElementById('sel-subperiodo-ano');
        const selAno = document.getElementById('sel-ano');

        if(selDia) selDia.classList.add('hidden');
        if(selMes) selMes.classList.add('hidden');
        if(selSemana) selSemana.classList.add('hidden');
        if(selSubAno) selSubAno.classList.add('hidden');
        if(selAno) selAno.classList.remove('hidden'); 

        if (tipo === 'dia') {
            if(selDia) selDia.classList.remove('hidden');
            if(selAno) selAno.classList.add('hidden'); 
        } else if (tipo === 'mes') {
            if(selMes) selMes.classList.remove('hidden');
        } else if (tipo === 'semana') {
            if(selSemana) selSemana.classList.remove('hidden');
            if(selMes) selMes.classList.remove('hidden'); 
        } else if (tipo === 'ano') {
            if(selSubAno) selSubAno.classList.remove('hidden');
        }

        if(salvar) this.salvarEAtualizar();
    },

    debounceTimer: null,

    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            dia: document.getElementById('sel-data-dia').value,
            ano: document.getElementById('sel-ano').value,
            mes: document.getElementById('sel-mes').value,
            semana: document.getElementById('sel-semana').value,
            sub: document.getElementById('sel-subperiodo-ano').value
        };
        localStorage.setItem('prod_filtro_state', JSON.stringify(estado));
        
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        const statusEl = document.getElementById('tabela-corpo');
        if(statusEl) statusEl.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-blue-400"><i class="fas fa-hourglass-half fa-spin"></i> Aguardando filtro...</td></tr>';

        this.debounceTimer = setTimeout(() => {
            this.atualizarTodasAbas();
        }, 800); 
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('prod_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                if(document.getElementById('sel-data-dia')) document.getElementById('sel-data-dia').value = s.dia || new Date().toISOString().split('T')[0];
                if(document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
                if(document.getElementById('sel-semana')) document.getElementById('sel-semana').value = s.semana;
                if(document.getElementById('sel-subperiodo-ano')) document.getElementById('sel-subperiodo-ano').value = s.sub;
                
                this.mudarPeriodo(s.tipo, false);
                return;
            } catch(e) { console.error("Erro ao carregar estado salvo", e); }
        }
        this.mudarPeriodo('mes', false);
    },

    getDatasFiltro: function() {
        let inicio, fim;

        if (this.filtroPeriodo === 'dia') {
            const dataDia = document.getElementById('sel-data-dia').value;
            inicio = dataDia;
            fim = dataDia;
        } else {
            const ano = parseInt(document.getElementById('sel-ano').value);
            const mes = parseInt(document.getElementById('sel-mes').value);

            if (this.filtroPeriodo === 'mes') {
                inicio = new Date(ano, mes, 1);
                fim = new Date(ano, mes + 1, 0);
            } 
            else if (this.filtroPeriodo === 'semana') {
                const semanaIndex = parseInt(document.getElementById('sel-semana').value);
                let current = new Date(ano, mes, 1);
                
                if (semanaIndex > 1) {
                    while (current.getDay() !== 0) { current.setDate(current.getDate() + 1); }
                    current.setDate(current.getDate() + (semanaIndex - 2) * 7);
                }
                
                inicio = new Date(current);
                fim = new Date(current);
                while (fim.getDay() !== 6) { fim.setDate(fim.getDate() + 1); }
                
                const ultimoDiaMes = new Date(ano, mes + 1, 0);
                if (inicio.getMonth() !== mes) {
                    inicio = ultimoDiaMes;
                    fim = ultimoDiaMes;
                } else {
                    if (fim > ultimoDiaMes) fim = ultimoDiaMes;
                }
            } 
            else if (this.filtroPeriodo === 'ano') {
                const sub = document.getElementById('sel-subperiodo-ano').value;
                if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
                else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
                else if (sub === 'S2') { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
                else if (sub.startsWith('T')) {
                    const tri = parseInt(sub.replace('T', ''));
                    const mesInicio = (tri - 1) * 3;
                    const mesFim = mesInicio + 3;
                    inicio = new Date(ano, mesInicio, 1);
                    fim = new Date(ano, mesFim, 0);
                }
            }
        }

        const fmt = (d) => {
            if (typeof d === 'string') return d; 
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const abaAlvo = document.getElementById(`tab-${abaId}`);
        const btnAlvo = document.getElementById(`btn-${abaId}`);
        
        if (abaAlvo) abaAlvo.classList.remove('hidden');
        if (btnAlvo) btnAlvo.classList.add('active');

        const ctrlAlvo = document.getElementById(`ctrl-${abaId}`);
        if(ctrlAlvo) ctrlAlvo.classList.remove('hidden');

        // Inicializa módulos específicos se existirem
        if (abaId === 'geral' && this.Geral) this.Geral.init();
        if (abaId === 'consolidado' && this.Consolidado) this.Consolidado.init();
        if (abaId === 'performance' && this.Performance) this.Performance.init();
        if (abaId === 'matriz' && this.Matriz) this.Matriz.init();
    },
    
    atualizarTodasAbas: function() {
        if(this.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) this.Geral.carregarTela();
        if(this.Consolidado && !document.getElementById('tab-consolidado').classList.contains('hidden')) this.Consolidado.carregar();
        if(this.Performance && !document.getElementById('tab-performance').classList.contains('hidden')) this.Performance.carregar();
        if(this.Matriz && !document.getElementById('tab-matriz').classList.contains('hidden')) this.Matriz.carregar();
    }
});

// Inicialização automática após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(window.Produtividade && window.Produtividade.init) window.Produtividade.init();
    }, 100);
});