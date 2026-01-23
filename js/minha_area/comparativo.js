/* ARQUIVO: js/minha_area/comparativo.js
   DESCRIÇÃO: Engine de Assertividade (Lógica Ajustada: Acertos vs Erros com Layout Dia-a-Dia)
*/

// ====================================================================
// MAPEAMENTO DE NOMES AMIGÁVEIS (UX)
// ====================================================================
const FRIENDLY_NAMES_MAP = {
    'DOC_NDF_100%': 'Empresas 100%',
    'DOC_NDF_CATEGORIA PROFISSIONAL': 'Categoria DIP',
    'DOC_NDF_DEPENDENTE': 'Categoria Dependentes',
    'DOC_NDF_ESTADO CIVIL': 'Categoria Certidão',
    'DOC_NDF_ESTRANGEIRO': 'Categoria Estrangeiro',
    'DOC_NDF_LAUDO': 'Categoria Laudo',
    'DOC_NDF_OUTROS': 'Empresa deveria Validar'
};

MinhaArea.Comparativo = {
    chartOfensores: null,
    dadosBrutosCache: [], 
    listaErrosCache: [], // Cache específico apenas para os erros (Feed/Gráfico)
    visaoAtual: 'doc', 
    mostrarTodos: false,

    carregar: async function() {
        console.time("PerformanceTotal");
        console.log("🚀 UX Dashboard: Iniciando Carga (Lógica: Novos Cards)...");
        const uid = MinhaArea.getUsuarioAlvo();
        
        if (!uid && typeof MinhaArea.isAdmin === 'function' && !MinhaArea.isAdmin()) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        const containerFeed = document.getElementById('feed-erros-container');
        
        // --- SELETORES DOS CARDS (IDs mantidos no novo HTML) ---
        const elTotalAuditados = document.getElementById('card-total-auditados');
        const elTotalAcertos = document.getElementById('card-total-acertos');
        const elTotalErros = document.getElementById('card-total-erros'); // Agora no rodapé do card Acertos

        const elErrosGupy = document.getElementById('card-erros-gupy'); 
        const elErrosNdf = document.getElementById('card-erros-ndf'); 
        const elEmpresaValidar = document.getElementById('card-empresa-validar'); // Agora no rodapé do card NDF

        const btnLimpar = document.getElementById('btn-limpar-filtro');
        
        if(btnLimpar) btnLimpar.classList.add('hidden');
        if(containerFeed) containerFeed.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2 text-blue-500"></i><br>Analisando auditorias...</div>';

        try {
            // 1. BUSCA PARALELA OTIMIZADA
            const dados = await this.buscarTudoPaginado(uid, inicio, fim);
            this.dadosBrutosCache = dados;

            console.log(`📦 Base Total: ${dados.length} registros auditados.`);

            // --- REGRAS DE NEGÓCIO ---
            let countTotalAuditados = 0; // Universo Total
            let countErrosGupy = 0;      // < 100% e não é NDF
            let countErrosNdf = 0;       // < 100% e é NDF (inclui 'Outros')
            let countNdfEmpresa = 0;     // Apenas 'DOC_NDF_OUTROS'

            const listaErros = []; // Apenas para o Feed e Gráfico

            for (let i = 0; i < dados.length; i++) {
                const d = dados[i];
                
                // Regra 1: Deve ter auditora
                if (!d.auditora_nome || d.auditora_nome.trim() === '') continue;

                // Incrementa o universo total
                countTotalAuditados++;

                // Regra 2: É erro? (Qtd NOK > 0)
                const isErro = (d.qtd_nok && Number(d.qtd_nok) > 0);

                if (isErro) {
                    listaErros.push(d); // Adiciona na lista visual

                    const tipoDocUpper = (d.tipo_documento || '').toUpperCase();
                    const isNdf = tipoDocUpper.startsWith('DOC_NDF_');

                    if (isNdf) {
                        countErrosNdf++;
                        if (tipoDocUpper === 'DOC_NDF_OUTROS') countNdfEmpresa++;
                    } else {
                        countErrosGupy++;
                    }
                }
            }
            
            this.listaErrosCache = listaErros;

            // --- CÁLCULOS FINAIS PARA OS CARDS ---
            // 1. Total de Erros (Geral)
            const totalErrosReais = countErrosGupy + countErrosNdf;
            
            // 2. Total de Acertos (Restante)
            const totalAcertos = countTotalAuditados - totalErrosReais;

            // 3. Separação visual: "Erros NDF" exibido retira o "Empresa Valida"
            const displayErrosNdf = countErrosNdf - countNdfEmpresa;

            // --- ATUALIZAÇÃO DO DOM (CARDS) ---
            
            // Card 1: Visão Geral
            if(elTotalAuditados) elTotalAuditados.innerText = countTotalAuditados.toLocaleString('pt-BR');
            if(elTotalAcertos) elTotalAcertos.innerText = totalAcertos.toLocaleString('pt-BR');
            if(elTotalErros) elTotalErros.innerText = totalErrosReais.toLocaleString('pt-BR');
            
            // Card 2 & 3 & 4
            if(elErrosGupy) elErrosGupy.innerText = countErrosGupy.toLocaleString('pt-BR'); 
            if(elErrosNdf) elErrosNdf.innerText = displayErrosNdf.toLocaleString('pt-BR'); 
            if(elEmpresaValidar) elEmpresaValidar.innerText = countNdfEmpresa.toLocaleString('pt-BR');

            // --- RENDERIZAÇÃO (Gráfico e Feed) ---
            if (listaErros.length === 0) {
                this.renderizarVazio(containerFeed);
                this.renderizarGraficoVazio();
                console.timeEnd("PerformanceTotal");
                return;
            }

            this.mudarVisao(this.visaoAtual); 
            console.timeEnd("PerformanceTotal");

        } catch (err) {
            console.error("Erro Comparativo:", err);
            if(containerFeed) containerFeed.innerHTML = `<div class="text-rose-500 text-center py-8">Erro ao carregar: ${err.message}</div>`;
        }
    },

    getFriendlyName: function(technicalName) {
        if (!technicalName) return 'Sem Nome';
        return FRIENDLY_NAMES_MAP[technicalName] || technicalName;
    },

    isNDF: function(d) {
        return (d.tipo_documento || '').toUpperCase().startsWith('DOC_NDF_');
    },

    getDocType: function(d) {
        if (this.isNDF(d)) {
            return d.tipo_documento || "DOC_NDF_GENERICO";
        }
        return d.doc_name || d.tipo_documento || 'Documento Gupy';
    },

    filtrarPorBusca: function(texto) {
        if (!texto || texto.trim() === '') {
            this.limparFiltro(true);
            return;
        }
        const termo = texto.toLowerCase();
        const base = this.listaErrosCache; 
        
        const filtrados = [];
        let matches = 0;
        
        for (let i = 0; i < base.length; i++) {
            if (matches >= 100) break;
            
            const d = base[i];
            const nome = (d.doc_name || '').toLowerCase();
            const tipoTecnico = (this.getDocType(d) || '');
            const tipoAmigavel = this.getFriendlyName(tipoTecnico).toLowerCase();
            const obs = (d.observacao || '').toLowerCase();
            const emp = (d.empresa_nome || '').toLowerCase();
            
            if (nome.includes(termo) || 
                tipoTecnico.toLowerCase().includes(termo) || 
                tipoAmigavel.includes(termo) || 
                obs.includes(termo) || 
                emp.includes(termo)) {
                
                filtrados.push(d);
                matches++;
            }
        }

        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar Busca`; }
    },

    toggleMostrarTodos: function() {
        this.mostrarTodos = !this.mostrarTodos;
        const btn = document.getElementById('btn-ver-todos');
        if(btn) btn.innerText = this.mostrarTodos ? 'Ver Top 5' : 'Ver Todos';
        this.mudarVisao(this.visaoAtual);
    },

    mudarVisao: function(novaVisao) {
        this.visaoAtual = novaVisao;
        
        const btnDoc = document.getElementById('btn-view-doc');
        const btnEmpresa = document.getElementById('btn-view-empresa');
        const btnNdf = document.getElementById('btn-view-ndf');
        
        const baseClass = "px-3 py-1 text-[10px] font-bold rounded transition ";
        const activeClass = "bg-white text-rose-600 shadow-sm";
        const inactiveClass = "text-slate-500 hover:bg-white";

        if(btnDoc) btnDoc.className = baseClass + (novaVisao === 'doc' ? activeClass : inactiveClass);
        if(btnEmpresa) btnEmpresa.className = baseClass + (novaVisao === 'empresa' ? activeClass : inactiveClass);
        if(btnNdf) btnNdf.className = baseClass + (novaVisao === 'ndf' ? activeClass : inactiveClass);

        this.limparFiltro(false);
        
        const base = this.listaErrosCache;
        let filtrados;
        
        if (novaVisao === 'ndf') {
            filtrados = base.filter(d => this.isNDF(d));
        } else {
            filtrados = base;
        }
        
        this.atualizarGrafico(filtrados);
        this.renderizarFeed(filtrados, document.getElementById('feed-erros-container'));
    },

    filtrarPorSelecao: function(valorAmigavel) {
        const base = this.listaErrosCache;
        const filtrados = [];
        let limit = 0;

        for (let i = 0; i < base.length; i++) {
            if (limit >= 200) break;
            const d = base[i];
            
            let match = false;
            if (this.visaoAtual === 'empresa') {
                const emp = d.empresa_nome || 'Desconhecida';
                match = (emp === valorAmigavel || emp.includes(valorAmigavel.replace('...', '')));
            } else {
                const tipoTecnico = this.visaoAtual === 'ndf' ? (d.tipo_documento || '') : this.getDocType(d);
                const nomeAmigavelItem = this.getFriendlyName(tipoTecnico);
                match = (nomeAmigavelItem === valorAmigavel || nomeAmigavelItem.includes(valorAmigavel.replace('...', '')));
            }

            if(match) {
                filtrados.push(d);
                limit++;
            }
        }
        
        this.aplicarFiltroVisual(filtrados, valorAmigavel);
    },

    atualizarGrafico: function(dadosParaGrafico) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();

        const agrupamento = {};
        
        const limitProcess = Math.min(dadosParaGrafico.length, 50000);

        for (let i = 0; i < limitProcess; i++) {
            const item = dadosParaGrafico[i];
            let chave = 'Outros';
            
            if (this.visaoAtual === 'empresa') {
                chave = item.empresa_nome || 'Desconhecida';
            } else if (this.visaoAtual === 'ndf') {
                const codigoTecnico = item.tipo_documento || item.doc_name || 'Sem Nome';
                chave = this.getFriendlyName(codigoTecnico);
            } else {
                const codigoTecnico = this.getDocType(item);
                chave = this.getFriendlyName(codigoTecnico);
            }
            
            if(chave.length > 28) chave = chave.substring(0, 26) + '...';
            
            agrupamento[chave] = (agrupamento[chave] || 0) + 1;
        }

        let dadosGrafico = Object.entries(agrupamento).sort((a, b) => b[1] - a[1]);
        if (!this.mostrarTodos) dadosGrafico = dadosGrafico.slice(0, 5);
        else dadosGrafico = dadosGrafico.slice(0, 50);

        this.renderizarGraficoOfensores(dadosGrafico);
    },

    aplicarFiltroVisual: function(lista, nomeFiltro) {
        const container = document.getElementById('feed-erros-container');
        this.renderizarFeed(lista, container);
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) { btn.classList.remove('hidden'); btn.innerHTML = `<i class="fas fa-times text-rose-500"></i> Limpar: ${nomeFiltro}`; }
    },

    limparFiltro: function(renderizar = true) {
        const btn = document.getElementById('btn-limpar-filtro');
        if(btn) btn.classList.add('hidden');
        const inputBusca = document.querySelector('#ma-tab-comparativo input');
        if(inputBusca) inputBusca.value = '';
        if (renderizar) this.mudarVisao(this.visaoAtual);
    },

    renderizarFeed: function(lista, container) {
        if(!container) return;
        
        const LIMITE_RENDER = 100;
        const totalItens = lista.length;
        
        lista.sort((a, b) => new Date(b.data_referencia || 0) - new Date(a.data_referencia || 0));
        
        const itensVisiveis = lista.slice(0, LIMITE_RENDER);
        
        if (totalItens === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-400">Nenhum erro encontrado neste filtro.</div>';
            return;
        }
        
        let html = '';
        
        if (totalItens > LIMITE_RENDER) {
            html += `<div class="bg-blue-50 text-blue-600 text-[10px] font-bold p-2 rounded mb-2 text-center border border-blue-100">
                <i class="fas fa-info-circle"></i> Exibindo os ${LIMITE_RENDER} erros mais recentes de um total de ${totalItens.toLocaleString()}.
            </div>`;
        }

        itensVisiveis.forEach(doc => {
            const data = doc.data_referencia ? new Date(doc.data_referencia).toLocaleDateString('pt-BR') : '-';
            const nomeDocumentoOriginal = doc.doc_name || 'Sem Nome';
            const tipoTecnico = this.getDocType(doc);
            const subtitulo = this.getFriendlyName(tipoTecnico);
            const empresa = doc.empresa_nome || ''; 
            const obs = doc.observacao || 'Sem observação.';
            const isNdf = this.isNDF(doc);
            
            let badgeClass = 'bg-rose-50 text-rose-600';
            let badgeText = 'NOK';
            let borderClass = 'border-l-rose-500';

            if (isNdf) {
                badgeClass = 'bg-amber-100 text-amber-700';
                badgeText = 'NDF';
                borderClass = 'border-l-amber-500';
            }

            const assistenteInfo = (!MinhaArea.getUsuarioAlvo()) ? `<span class="block text-[9px] text-blue-500 font-bold mt-1">👤 ${doc.assistente_nome || 'Equipe'}</span>` : '';

            html += `
            <div class="bg-white p-3 rounded-lg border-l-4 ${borderClass} shadow-sm hover:shadow-md transition border border-slate-100 group mb-2">
                <div class="flex justify-between items-start mb-1">
                    <div class="overflow-hidden pr-2">
                        <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block truncate">${data} • ${subtitulo}</span>
                        <h4 class="font-bold text-slate-700 text-xs leading-tight truncate" title="${nomeDocumentoOriginal}">${nomeDocumentoOriginal}</h4>
                        <div class="text-[9px] text-slate-500 truncate" title="${empresa}">${empresa}</div>
                        ${assistenteInfo}
                    </div>
                    <div class="${badgeClass} text-[9px] font-bold px-1.5 py-0.5 rounded border border-white shadow-sm whitespace-nowrap">${badgeText}</div>
                </div>
                <div class="bg-slate-50 p-2 rounded text-[10px] text-slate-600 italic border border-slate-100 line-clamp-2" title="${obs}"><i class="fas fa-quote-left text-slate-300 mr-1"></i> ${obs}</div>
            </div>`;
        });
        container.innerHTML = html;
    },

    renderizarGraficoOfensores: function(dados) {
        const ctx = document.getElementById('graficoTopOfensores');
        if (!ctx) return;
        if (this.chartOfensores) this.chartOfensores.destroy();
        
        const labels = dados.map(d => d[0]);
        const values = dados.map(d => d[1]);
        const _this = this;
        
        let barColor = '#f43f5e'; 
        if (this.visaoAtual === 'empresa') barColor = '#3b82f6'; 
        if (this.visaoAtual === 'ndf') barColor = '#d97706'; 

        this.chartOfensores = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ 
                    label: 'Ocorrências', 
                    data: values, 
                    backgroundColor: barColor, 
                    borderRadius: 4, 
                    barThickness: 'flex',
                    maxBarThickness: 30,
                    hoverBackgroundColor: '#1e293b' 
                }] 
            },
            options: {
                indexAxis: 'y', 
                responsive: true, 
                maintainAspectRatio: false,
                onClick: (e, elements) => { 
                    if (elements.length > 0) { 
                        const index = elements[0].index; 
                        _this.filtrarPorSelecao(labels[index]); 
                    } 
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        padding: 10,
                        titleFont: { family: "'Nunito', sans-serif" },
                        bodyFont: { family: "'Nunito', sans-serif" }
                    }
                },
                scales: { 
                    x: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        ticks: { 
                            autoSkip: true,
                            maxTicksLimit: 8,
                            font: { size: 10 } 
                        } 
                    }, 
                    y: { 
                        grid: { display: false }, 
                        ticks: { font: { size: 10, weight: 'bold' }, color: '#64748b' } 
                    } 
                }
            }
        });
    },

    renderizarVazio: function(container) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-center p-8"><div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 text-emerald-500"><i class="fas fa-trophy text-3xl"></i></div><h3 class="text-lg font-bold text-slate-700">Parabéns!</h3><p class="text-sm text-slate-500">Nenhum erro encontrado nos registros auditados.</p></div>';
    },

    renderizarGraficoVazio: function() {
        const ctx = document.getElementById('graficoTopOfensores');
        if (ctx && this.chartOfensores) this.chartOfensores.destroy();
    },

    buscarTudoPaginado: async function(uid, inicio, fim) {
        let queryCount = Sistema.supabase
            .from('assertividade')
            .select('*', { count: 'exact', head: true }) 
            .gte('data_referencia', inicio)
            .lte('data_referencia', fim)
            .neq('auditora_nome', null);

        if (uid) queryCount = queryCount.eq('usuario_id', uid);

        const { count, error: errCount } = await queryCount;
        
        if (errCount) throw errCount;
        if (count === 0) return [];

        const PAGE_SIZE = 1000;
        const totalPages = Math.ceil(count / PAGE_SIZE);
        const promises = [];
        const colunas = 'id, data_referencia, auditora_nome, tipo_documento, doc_name, observacao, status, empresa_nome, assistente_nome, qtd_nok';
        const MAX_PAGES = 300; 
        const pagesToFetch = Math.min(totalPages, MAX_PAGES);

        for (let i = 0; i < pagesToFetch; i++) {
            let query = Sistema.supabase
                .from('assertividade')
                .select(colunas)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .neq('auditora_nome', null)
                .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);

            if (uid) query = query.eq('usuario_id', uid);
            promises.push(query);
        }

        const responses = await Promise.all(promises);

        let todos = [];
        responses.forEach(({ data, error }) => {
            if (!error && data) {
                todos = todos.concat(data);
            }
        });

        return todos;
    }
};