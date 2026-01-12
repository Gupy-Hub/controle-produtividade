const Produtividade = {
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

        // 1. Configura os seletores (Anos, Meses)
        this.popularSeletoresIniciais();

        // 2. Carrega estado salvo ou padrão
        this.carregarEstadoSalvo();

        // 3. Inicia na aba padrão
        this.mudarAba('geral');
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
    },

    // --- CONTROLE DE DATAS (NOVO) ---

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        
        // Atualiza botões
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                else btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
            }
        });

        // Alterna visibilidade dos selects
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

    salvarEAtualizar: function() {
        // Salva preferência
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano').value,
            mes: document.getElementById('sel-mes').value,
            semana: document.getElementById('sel-semana').value,
            sub: document.getElementById('sel-subperiodo-ano').value
        };
        localStorage.setItem('prod_filtro_state', JSON.stringify(estado));
        
        this.atualizarTodasAbas();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('prod_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
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

    // Função Central para pegar o Range de Datas
    getDatasFiltro: function() {
        const ano = parseInt(document.getElementById('sel-ano').value);
        const mes = parseInt(document.getElementById('sel-mes').value);
        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
        } else if (this.filtroPeriodo === 'semana') {
            const semanaIndex = parseInt(document.getElementById('sel-semana').value);
            // Lógica simples: Semana 1 (Dias 1-7), Semana 2 (8-14)...
            const diaInicio = (semanaIndex - 1) * 7 + 1;
            let diaFim = diaInicio + 6;
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
            if (diaFim > ultimoDiaMes) diaFim = ultimoDiaMes;
            
            if (diaInicio > ultimoDiaMes) {
                inicio = new Date(ano, mes, ultimoDiaMes);
                fim = new Date(ano, mes, ultimoDiaMes);
            } else {
                inicio = new Date(ano, mes, diaInicio);
                fim = new Date(ano, mes, diaFim);
            }
        } else if (this.filtroPeriodo === 'ano') {
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

        const fmt = (d) => {
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

        // Mostra/Oculta controles específicos (se houver, mas agora unificamos quase tudo)
        const ctrlAlvo = document.getElementById(`ctrl-${abaId}`);
        if(ctrlAlvo) ctrlAlvo.classList.remove('hidden');

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
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(typeof Produtividade !== 'undefined') Produtividade.init();
    }, 100);
});