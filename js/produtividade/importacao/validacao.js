// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("🚀 GupyMesa: Engine V2.8 (Mapeamento CSV + Regex Flexível)");
    },

    /**
     * Extrai data de nomes variados: 01122025.csv, 1122025.csv, 01-12-2025.csv
     */
    extrairDataDoNome: function(nome) {
        // Tenta capturar DD, MM, AAAA com ou sem separadores
        // Aceita dias/meses com 1 ou 2 digitos (ex: 5122025 ou 05122025)
        const match = nome.match(/(\d{1,2})[\.\-\/]?(\d{1,2})[\.\-\/]?(\d{4})/);
        
        if (match) {
            let [_, dia, mes, ano] = match;
            // Garante zeros à esquerda (padStart) para manter o padrão ISO (YYYY-MM-DD)
            dia = dia.padStart(2, '0');
            mes = mes.padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
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
            statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Analisando ${files.length} arquivos...</span>`;
        }

        let arquivosIgnorados = 0;

        for (const file of files) {
            const dataRef = this.extrairDataDoNome(file.name);
            
            if (!dataRef) {
                console.warn(`Arquivo ignorado (data não identificada): ${file.name}`);
                arquivosIgnorados++;
                continue;
            }

            await new Promise(resolve => {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: "UTF-8", // Garante leitura correta de acentos
                    transformHeader: h => h.trim().toLowerCase(), // Normaliza headers
                    complete: (res) => {
                        this.prepararDados(res.data, dataRef);
                        resolve();
                    }
                });
            });
        }

        this.finalizarAnalise(files.length, arquivosIgnorados);
        input.value = '';
    },

    prepararDados: function(linhas, dataFixa) {
        linhas.forEach(row => {
            // Lógica para ignorar a linha de Total e linhas vazias
            let id = row['id_assistente'] || row['usuario_id'] || row['id'];
            if (!id || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) return;
            
            const usuarioId = parseInt(id.toString().replace(/\D/g, ''));
            if (isNaN(usuarioId)) return;

            // MAPEAMENTO CORRIGIDO PARA O SEU CSV (01122025.csv)
            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                
                // Prioriza as colunas longas do CSV, fallback para as curtas (retrocompatibilidade)
                quantidade: parseInt(row['documentos_validados'] || row['quantidade'] || 0),
                fifo: parseInt(row['documentos_validados_fifo'] || row['fifo'] || 0),
                gradual_total: parseInt(row['documentos_validados_gradual_total'] || row['gradual_total'] || 0),
                gradual_parcial: parseInt(row['documentos_validados_gradual_parcial'] || row['gradual_parcial'] || 0),
                perfil_fc: parseInt(row['documentos_validados_perfil_fc'] || row['perfil_fc'] || 0),
                
                fator: 1,
                status: 'OK'
            });
        });
    },

    finalizarAnalise: function(totalArquivos, ignorados) {
        const statusEl = document.getElementById('status-importacao-prod');
        
        if (this.dadosProcessados.length === 0) {
            alert("Nenhum dado válido encontrado. Verifique os nomes dos arquivos (Ex: 01122025.csv).");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // Identifica datas únicas para mostrar no resumo
        const datasUnicas = [...new Set(this.dadosProcessados.map(d => d.data_referencia))].sort();
        const range = datasUnicas.length > 1 
            ? `${datasUnicas[0]} até ${datasUnicas[datasUnicas.length-1]}`
            : datasUnicas[0];

        let msg = `Resumo da Importação:\n\n` +
                  `📄 Arquivos Lidos: ${totalArquivos - ignorados}\n` +
                  `📅 Período: ${range}\n` +
                  `📊 Total Registros: ${this.dadosProcessados.length}\n`;
        
        if (ignorados > 0) msg += `⚠️ Arquivos Ignorados: ${ignorados} (Nome inválido)\n`;
        
        msg += `\nDeseja atualizar o banco de dados?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        } else {
            if(statusEl) statusEl.innerHTML = "";
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500"><i class="fas fa-sync fa-spin"></i> Enviando dados...</span>`;

            // Utiliza UPSERT para atualizar dias existentes sem duplicar
            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Sucesso! Dados atualizados corretamente.");
            
            // Recarrega a tela atual para refletir os números
            if (window.Produtividade.Geral?.carregarTela) {
                window.Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error("Erro Upsert:", e);
            alert("Erro ao gravar: " + (e.message || "Falha na comunicação com o banco."));
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

window.Produtividade.Importacao.Validacao.init();