// ARQUIVO: js/produtividade/importacao/validacao.js

window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("🚀 GupyMesa: Engine Importação V3.0 (Smart Headers)");
    },

    /**
     * MANTIDO CONFORME REGRA DE NEGÓCIO:
     * A data DEVE vir do nome do arquivo (ex: 01122025.csv).
     */
    extrairDataDoNome: function(nome) {
        // Regex estrita para capturar DDMMAAAA no nome do arquivo
        const match = nome.match(/(\d{1,2})[\.\-\/]?(\d{1,2})[\.\-\/]?(\d{4})/);
        if (match) {
            let [_, dia, mes, ano] = match;
            dia = dia.padStart(2, '0');
            mes = mes.padStart(2, '0');
            return `${ano}-${mes}-${dia}`; // Formato ISO para banco
        }
        return null;
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Processando ${files.length} arquivos...</span>`;
        }

        let arquivosIgnorados = 0;
        let arquivosProcessados = 0;

        for (const file of files) {
            const dataRef = this.extrairDataDoNome(file.name);
            
            if (!dataRef) {
                console.warn(`⚠️ Ignorado (Nome sem data): ${file.name}`);
                arquivosIgnorados++;
                continue;
            }

            await new Promise(resolve => {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: "UTF-8",
                    transformHeader: h => h.trim().toLowerCase() // Normaliza headers
                        .replace(/[áàãâ]/g, 'a')
                        .replace(/[éê]/g, 'e')
                        .replace(/[í]/g, 'i')
                        .replace(/[óõô]/g, 'o')
                        .replace(/[ú]/g, 'u')
                        .replace(/ç/g, 'c'), 
                    complete: (res) => {
                        this.prepararDados(res.data, dataRef, file.name);
                        arquivosProcessados++;
                        resolve();
                    }
                });
            });
        }

        this.finalizarAnalise(files.length, arquivosIgnorados);
        input.value = '';
    },

    prepararDados: function(linhas, dataFixa, fileName) {
        if (!linhas || linhas.length === 0) return;

        // DEBUG: Mostra headers encontrados para ajudar a diagnosticar CSVs novos
        const headers = Object.keys(linhas[0]);
        console.log(`📂 Arquivo: ${fileName} | Headers:`, headers);

        linhas.forEach(row => {
            // Robustez na busca do ID (tenta várias colunas comuns)
            let id = row['id_assistente'] || row['usuario_id'] || row['id'] || row['matricula'];
            
            // Ignora linha de totais ou vazias
            if (!id || (row['assistente'] && row['assistente'].toLowerCase().includes('total'))) return;
            
            const usuarioId = parseInt(id.toString().replace(/\D/g, ''));
            if (isNaN(usuarioId)) return;

            // --- SMART MAPPING (Correção da Fragilidade) ---
            // Tenta encontrar o valor em colunas com nomes variados
            const getVal = (chaves) => {
                for (let k of chaves) if (row[k] !== undefined && row[k] !== "") return parseInt(row[k]);
                return 0;
            };

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                
                // Busca em lista de sinônimos para evitar quebra se mudar o CSV
                quantidade: getVal(['documentos_validados', 'quantidade', 'qtd', 'total_validados']),
                fifo: getVal(['documentos_validados_fifo', 'fifo', 'qtd_fifo']),
                gradual_total: getVal(['documentos_validados_gradual_total', 'gradual_total', 'gradual total']),
                gradual_parcial: getVal(['documentos_validados_gradual_parcial', 'gradual_parcial', 'gradual parcial']),
                perfil_fc: getVal(['documentos_validados_perfil_fc', 'perfil_fc', 'fc']),
                
                fator: 1, // Padrão 1 (Dia completo)
                status: 'OK'
            });
        });
    },

    finalizarAnalise: function(totalArquivos, ignorados) {
        const statusEl = document.getElementById('status-importacao-prod');
        
        if (this.dadosProcessados.length === 0) {
            alert("❌ Nenhum dado válido encontrado!\n\nVerifique:\n1. O nome do arquivo tem data (ex: 01122025.csv)?\n2. O arquivo CSV tem as colunas corretas?");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        const datasUnicas = [...new Set(this.dadosProcessados.map(d => d.data_referencia))].sort();
        const range = datasUnicas.length > 1 
            ? `${datasUnicas[0]} até ${datasUnicas[datasUnicas.length-1]}`
            : datasUnicas[0];

        let msg = `Resumo da Importação:\n\n` +
                  `✅ Arquivos Processados: ${totalArquivos - ignorados}\n` +
                  `📅 Datas Identificadas: ${range}\n` +
                  `📊 Linhas de Produção: ${this.dadosProcessados.length}\n`;
        
        if (ignorados > 0) msg += `⚠️ Arquivos Ignorados (Sem data no nome): ${ignorados}\n`;
        
        msg += `\nConfirmar gravação no banco de dados?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        } else {
            if(statusEl) statusEl.innerHTML = "";
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Gravando dados...</span>`;

            // Utiliza UPSERT para atualizar dias existentes sem duplicar
            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Sucesso! Dados de produção atualizados.");
            
            // Força atualização da tela
            if (window.Produtividade.Geral?.carregarTela) window.Produtividade.Geral.carregarTela();
            if (window.Produtividade.Consolidado?.carregar) window.Produtividade.Consolidado.carregar(true);

        } catch (e) {
            console.error("Erro Upsert:", e);
            alert("Erro ao gravar no banco: " + (e.message || "Verifique sua conexão."));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

window.Produtividade.Importacao.Validacao.init();