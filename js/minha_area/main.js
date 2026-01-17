// ARQUIVO: js/minha_area/main.js
window.MinhaArea = window.MinhaArea || {};

Object.assign(window.MinhaArea, {
    filtroPeriodo: 'mes',

    /**
     * Inicializa os componentes da Área do Utilizador
     */
    init: async function() {
        console.log("Minha Área Iniciada");
        this.popularSeletoresIniciais();
        this.carregarEstadoSalvo();
        this.mudarAba('diario');
    },

    /**
     * Preenche os seletores de Ano e Mês com valores padrão de segurança
     */
    popularSeletoresIniciais: function() {
        const seletorAno = document.getElementById('sel-ano');
        const anoAtual = new Date().getFullYear();
        
        if (seletorAno && !seletorAno.innerHTML) {
            let htmlOpcoes = '';
            for (let i = anoAtual; i >= anoAtual - 1; i--) {
                htmlOpcoes += `<option value="${i}">${i}</option>`;
            }
            seletorAno.innerHTML = htmlOpcoes;
        }

        const seletorMes = document.getElementById('sel-mes');
        if (seletorMes && seletorMes.value === "") {
            seletorMes.value = new Date().getMonth();
        }
    },

    /**
     * Obtém o ID do utilizador alvo (próprio ou selecionado por admin)
     */
    getUsuarioAlvo: function() {
        const seletorAdmin = document.getElementById('admin-user-selector');
        if (seletorAdmin && seletorAdmin.value) return seletorAdmin.value;
        
        const usuarioLogado = localStorage.getItem('usuario_logado');
        return usuarioLogado ? JSON.parse(usuarioLogado).id : null;
    },

    /**
     * Gera o intervalo de datas para o filtro, evitando erros de NaN-NaN-NaN
     */
    getDatasFiltro: function() {
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
            if (subperiodo === 'S1') {
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

        const formatarData = (data) => {
            const aaaa = data.getFullYear();
            const mm = String(data.getMonth() + 1).padStart(2, '0');
            const dd = String(data.getDate()).padStart(2, '0');
            return `${aaaa}-${mm}-${dd}`;
        };

        return {
            inicio: formatarData(dataInicio),
            fim: formatarData(dataFim)
        };
    },

    /**
     * Gere a navegação entre as abas da área pessoal
     */
    mudarAba: function(idAba) {
        document.querySelectorAll('.ma-view').forEach(view => view.classList.add('hidden'));
        const abaAlvo = document.getElementById(`ma-tab-${idAba}`);
        if (abaAlvo) abaAlvo.classList.remove('hidden');

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const botaoAlvo = document.getElementById(`btn-ma-${idAba}`);
        if (botaoAlvo) botaoAlvo.classList.add('active');

        if (idAba === 'diario') MinhaArea.Geral.carregar();
    },

    carregarEstadoSalvo: function() {
        const salvo = localStorage.getItem('minha_area_filtro_state');
        if (salvo) {
            try {
                const s = JSON.parse(salvo);
                this.filtroPeriodo = s.tipo || 'mes';
                if (document.getElementById('sel-ano')) document.getElementById('sel-ano').value = s.ano;
                if (document.getElementById('sel-mes')) document.getElementById('sel-mes').value = s.mes;
            } catch (e) { console.error("Erro ao restaurar estado", e); }
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

    mudarPeriodo: function(tipo, salvar = true) {
        this.filtroPeriodo = tipo;
        if (salvar) this.salvarEAtualizar();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.MinhaArea && window.MinhaArea.init) window.MinhaArea.init();
});