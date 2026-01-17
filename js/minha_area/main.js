// ARQUIVO: js/minha_area/main.js
window.MinhaArea = window.MinhaArea || {};

Object.assign(window.MinhaArea, {
    filtroPeriodo: 'mes', // Período padrão inicial

    init: async function() {
        console.log("Minha Área Iniciada");
        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        this.mudarAba('diario');
    },

    popularSeletoresIniciais: function() {
        // Popula o seletor de ano
        const seletorAno = document.getElementById('sel-ano');
        const anoAtual = new Date().getFullYear();
        if (seletorAno && !seletorAno.innerHTML) {
            let opcoesAnos = '';
            for (let i = anoAtual; i >= anoAtual - 1; i--) {
                opcoesAnos += `<option value="${i}">${i}</option>`;
            }
            seletorAno.innerHTML = opcoesAnos;
        }

        // Popula o seletor de mês
        const seletorMes = document.getElementById('sel-mes');
        if (seletorMes && seletorMes.value === "") {
            seletorMes.value = new Date().getMonth();
        }
    },

    getDatasFiltro: function() {
        // Captura de valores com tratamento de erro para evitar NaN-NaN-NaN
        const elementoAno = document.getElementById('sel-ano');
        const elementoMes = document.getElementById('sel-mes');
        
        const ano = parseInt(elementoAno?.value) || new Date().getFullYear();
        const mes = parseInt(elementoMes?.value) || new Date().getMonth();
        
        let dataInicio, dataFim;

        if (this.filtroPeriodo === 'mes') {
            dataInicio = new Date(ano, mes, 1);
            dataFim = new Date(ano, mes + 1, 0);
        } else if (this.filtroPeriodo === 'ano') {
            const subperiodo = document.getElementById('sel-subperiodo-ano')?.value || 'full';
            if (subperiodo === 'full') { 
                dataInicio = new Date(ano, 0, 1); 
                dataFim = new Date(ano, 11, 31); 
            } else if (subperiodo === 'S1') { 
                dataInicio = new Date(ano, 0, 1); 
                dataFim = new Date(ano, 5, 30); 
            } else if (subperiodo === 'S2') { 
                dataInicio = new Date(ano, 6, 1); 
                dataFim = new Date(ano, 11, 31); 
            } else { 
                dataInicio = new Date(ano, 0, 1); 
                dataFim = new Date(ano, 11, 31); 
            }
        }

        // Função interna para formatar objeto Date em string YYYY-MM-DD
        const formatarParaString = (dataObjeto) => {
            const yyyy = dataObjeto.getFullYear();
            const mm = String(dataObjeto.getMonth() + 1).padStart(2, '0');
            const dd = String(dataObjeto.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        return { 
            inicio: formatarParaString(dataInicio), 
            fim: formatarParaString(dataFim) 
        };
    },

    mudarAba: function(idAba) {
        // Alterna visibilidade das seções
        document.querySelectorAll('.ma-view').forEach(view => view.classList.add('hidden'));
        const abaAlvo = document.getElementById(`ma-tab-${idAba}`);
        if (abaAlvo) abaAlvo.classList.remove('hidden');

        // Alterna estado dos botões
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const botaoAlvo = document.getElementById(`btn-ma-${idAba}`);
        if (botaoAlvo) botaoAlvo.classList.add('active');

        // Carrega os dados específicos da aba
        if (idAba === 'diario') MinhaArea.Geral.carregar();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('minha_area_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                this.filtroPeriodo = s.tipo || 'mes';
                if(document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if(document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
                this.mudarPeriodo(this.filtroPeriodo, false);
            } catch(e) { console.error("Erro ao carregar estado salvo", e); }
        }
    },

    salvarEAtualizar: function() {
        const estado = {
            tipo: this.filtroPeriodo,
            ano: document.getElementById('sel-ano')?.value,
            mes: document.getElementById('sel-mes')?.value
        };
        localStorage.setItem('minha_area_filtro_state', JSON.stringify(estado));
        this.mudarAba('diario');
    },

    mudarPeriodo: function(tipo, deveSalvar = true) {
        this.filtroPeriodo = tipo;
        if (deveSalvar) this.salvarEAtualizar();
    }
});