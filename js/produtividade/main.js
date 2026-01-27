// ARQUIVO: js/produtividade/main.js

window.Produtividade = window.Produtividade || {};

Object.assign(window.Produtividade, {
    supabase: null, 
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Módulo Produtividade Iniciado");
        
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);

        // --- REABILITAÇÃO DO CHECKING ---
        // Registra a atividade diária assim que entra no dashboard
        if (window.Sistema && window.Sistema.registrarAcesso) {
            await window.Sistema.registrarAcesso(this.usuario.id);
        }

        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        this.verificarStatusPresenca(); // Atualiza UI de presença
        this.mudarAba('geral');
    },

    verificarStatusPresenca: async function() {
        const hoje = new Date().toISOString().split('T')[0];
        try {
            // Verifica na tabela acessos_diarios se há registro para hoje
            const { data, error } = await Sistema.supabase
                .from('acessos_diarios')
                .select('id')
                .eq('usuario_id', this.usuario.id)
                .eq('data_referencia', hoje)
                .maybeSingle();

            const statusEl = document.getElementById('status-presenca-hoje');
            if (statusEl) {
                if (data) {
                    statusEl.innerHTML = '<span class="text-green-500 font-bold"><i class="fas fa-check-circle"></i> CHECKING ATIVO</span>';
                } else {
                    statusEl.innerHTML = '<span class="text-amber-500 font-bold"><i class="fas fa-clock"></i> AGUARDANDO REGISTRO</span>';
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

        const diaInput = document.getElementById('sel-data-dia');
        if(diaInput && !diaInput.value) {
            diaInput.value = new Date().toISOString().split('T')[0];
        }
    },

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        
        ['dia', 'mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                btn.className = (t === tipo) 
                    ? "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition"
                    : "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        const elementos = {
            dia: document.getElementById('sel-data-dia'),
            mes: document.getElementById('sel-mes'),
            semana: document.getElementById('sel-semana'),
            sub: document.getElementById('sel-subperiodo-ano'),
            ano: document.getElementById('sel-ano')
        };

        Object.values(elementos).forEach(el => el?.classList.add('hidden'));
        elementos.ano?.classList.remove('hidden');

        if (tipo === 'dia') {
            elementos.dia?.classList.remove('hidden');
            elementos.ano?.classList.add('hidden');
        } else if (tipo === 'mes') {
            elementos.mes?.classList.remove('hidden');
        } else if (tipo === 'semana') {
            elementos.semana?.classList.remove('hidden');
            elementos.mes?.classList.remove('hidden');
        } else if (tipo === 'ano') {
            elementos.sub?.classList.remove('hidden');
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
            } catch(e) { console.error("Erro estado salvo", e); }
        }
        this.mudarPeriodo('mes', false);
    },

    getDatasFiltro: function() {
        let inicio, fim;
        const fmt = (d) => {
            if (typeof d === 'string') return d; 
            return d.toISOString().split('T')[0];
        };

        if (this.filtroPeriodo === 'dia') {
            inicio = fim = document.getElementById('sel-data-dia').value;
        } else {
            const ano = parseInt(document.getElementById('sel-ano').value);
            const mes = parseInt(document.getElementById('sel-mes').value);

            if (this.filtroPeriodo === 'mes') {
                inicio = new Date(ano, mes, 1);
                fim = new Date(ano, mes + 1, 0);
            } else if (this.filtroPeriodo === 'semana') {
                const sem = parseInt(document.getElementById('sel-semana').value);
                let d = new Date(ano, mes, 1);
                if (sem > 1) {
                    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
                    d.setDate(d.getDate() + (sem - 2) * 7);
                }
                inicio = new Date(d);
                fim = new Date(d);
                while (fim.getDay() !== 6) fim.setDate(fim.getDate() + 1);
                const last = new Date(ano, mes + 1, 0);
                if (fim > last) fim = last;
            } else if (this.filtroPeriodo === 'ano') {
                const sub = document.getElementById('sel-subperiodo-ano').value;
                if (sub === 'full') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 11, 31); }
                else if (sub === 'S1') { inicio = new Date(ano, 0, 1); fim = new Date(ano, 5, 30); }
                else if (sub === 'S2') { inicio = new Date(ano, 6, 1); fim = new Date(ano, 11, 31); }
            }
        }
        return { inicio: fmt(inicio), fim: fmt(fim) };
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        document.getElementById(`tab-${abaId}`)?.classList.remove('hidden');
        document.getElementById(`btn-${abaId}`)?.classList.add('active');
        document.getElementById(`ctrl-${abaId}`)?.classList.remove('hidden');

        if (this[abaId.charAt(0).toUpperCase() + abaId.slice(1)]) {
            this[abaId.charAt(0).toUpperCase() + abaId.slice(1)].init?.();
        }
    },
    
    atualizarTodasAbas: function() {
        const abas = ['Geral', 'Consolidado', 'Performance', 'Matriz'];
        abas.forEach(aba => {
            const id = aba.toLowerCase();
            if(this[aba] && !document.getElementById(`tab-${id}`).classList.contains('hidden')) {
                const func = this[aba].carregarTela || this[aba].carregar;
                if(func) func.call(this[aba]);
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.Produtividade?.init(); }, 100);
});