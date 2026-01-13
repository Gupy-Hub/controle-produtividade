window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    mapaUsuarios: {}, 
    statusNeutros: ['REV', 'DUPL', 'EMPR', 'IA', 'NA', 'N/A', 'REVALIDA'], 

    init: async function() {
        console.log("📥 Importação: Iniciando módulo de validação...");
        await this.carregarUsuarios();
    },

    carregarUsuarios: async function() {
        const { data, error } = await Sistema.supabase
            .from('usuarios')
            .select('id, nome');
        
        if (error) {
            console.error("Erro ao carregar usuários:", error);
            return;
        }

        this.mapaUsuarios = {};
        data.forEach(u => {
            const nomeNorm = this.normalizarTexto(u.nome);
            this.mapaUsuarios[nomeNorm] = u.id;
        });
    },

    normalizarTexto: function(txt) {
        if (!txt) return "";
        return txt.toString().trim().toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); 
    },

    processar: function(input) {
        const file = input.files[0];
        if (!file) return;

        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo CSV...</span>`;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8",
                transformHeader: function(h) {
                    return h.trim().toLowerCase();
                },
                complete: (results) => {
                    this.analisarDados(results.data);
                }
            });
        };
        reader.readAsText(file, "UTF-8"); 
        
        input.value = '';
    },

    analisarDados: async function(linhas) {
        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        
        if (linhas.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert("Arquivo vazio.");
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-cog fa-spin"></i> Analisando...</span>`;
        await new Promise(r => setTimeout(r, 50));

        let erros = 0;
        let importaveis = 0;

        const elDataTela = document.getElementById('sel-data-dia');
        const dataTela = elDataTela ? elDataTela.value : null;

        if (Object.keys(this.mapaUsuarios).length === 0) await this.carregarUsuarios();

        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            
            const nomeRaw = row['nome'] || row['assistente'] || row['colaborador'];
            
            if (!nomeRaw || nomeRaw.toLowerCase() === 'total') continue;

            let dataRaw = row['data'] || row['data referencia'] || row['data_referencia'];
            if (!dataRaw && dataTela) {
                dataRaw = dataTela; 
            }

            const qtdRaw = row['quantidade'] || row['qtd'] || row['documentos_validados'];
            
            let statusRaw = row['status'] || row['classificação'];
            if (!statusRaw && row['documentos_validados']) {
                statusRaw = 'OK';
            }
            if (!statusRaw) statusRaw = 'OK'; 

            // Nota: Removemos a leitura de auditora pois a tabela producao não suporta
            
            const fifo = row['fifo'] || row['documentos_validados_fifo'] || 0;
            const gTotal = row['gradual total'] || row['gradual_total'] || row['documentos_validados_gradual_total'] || 0;
            const gParcial = row['gradual parcial'] || row['gradual_parcial'] || row['documentos_validados_gradual_parcial'] || 0;
            const perfilFc = row['perfil fc'] || row['perfil_fc'] || row['documentos_validados_perfil_fc'] || 0;

            if (!dataRaw) {
                console.warn("Linha ignorada por falta de data:", row);
                continue;
            }

            const nomeNorm = this.normalizarTexto(nomeRaw);
            const usuarioId = this.mapaUsuarios[nomeNorm];
            
            let status = this.normalizarTexto(statusRaw);
            if (status === 'ERRO') status = 'NOK';
            if (status === 'SUCESSO' || status === 'VALIDO') status = 'OK';
            
            let assertVisual = '<span class="text-slate-400">--</span>';
            const isOk = ['OK', 'VALIDO', 'PROCESSADO', 'CONCLUIDO'].some(s => status.includes(s));
            const isNok = status.includes('NOK');
            
            if (isOk) assertVisual = '<span class="text-emerald-600 font-bold">100%</span>';
            else if (isNok) assertVisual = '<span class="text-rose-600 font-bold">0%</span>';
            else if (this.statusNeutros.some(s => status.includes(s))) assertVisual = '<span class="text-slate-400 italic">-- (Neutro)</span>';
            else assertVisual = '<span class="text-amber-500">?</span>';

            const item = {
                usuario_id: usuarioId,
                nome_original: nomeRaw,
                data_referencia: this.formatarDataBanco(dataRaw), 
                quantidade: parseInt(qtdRaw) || 0,
                status: status,
                fifo: parseInt(fifo) || 0,
                gradual_total: parseInt(gTotal) || 0,
                gradual_parcial: parseInt(gParcial) || 0,
                perfil_fc: parseInt(perfilFc) || 0,
                valido: !!usuarioId,
                visual_assert: assertVisual
            };

            if (!item.valido) erros++;
            else importaveis++;

            this.dadosProcessados.push(item);
        }

        if(statusEl) statusEl.innerHTML = ""; 

        const msg = `Análise do Arquivo:\n\n` +
                    `📅 Data atribuída: ${dataTela || 'Do Arquivo'}\n` +
                    `✅ Prontos para importar: ${importaveis}\n` +
                    `❌ Usuários não encontrados: ${erros}\n\n` +
                    `Deseja prosseguir com a importação?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        }
    },

    formatarDataBanco: function(dataStr) {
        if (!dataStr) return null;
        if (dataStr.includes('-') && dataStr.length === 10) return dataStr;
        if (dataStr.includes('/')) {
            const parts = dataStr.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dataStr;
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        const btn = document.querySelector('button[onclick*="Importar"]');
        
        if(btn) { btn.disabled = true; } 

        const payload = this.dadosProcessados
            .filter(d => d.valido)
            .map(d => ({
                usuario_id: d.usuario_id,
                data_referencia: d.data_referencia,
                quantidade: d.quantidade,
                status: d.status, 
                // auditora removida daqui para evitar erro de schema
                fifo: d.fifo,
                gradual_total: d.gradual_total,
                gradual_parcial: d.gradual_parcial,
                perfil_fc: d.perfil_fc,
                fator: 1 
            }));

        if (payload.length === 0) {
            if(btn) { btn.disabled = false; }
            return alert("Nada para importar.");
        }

        const BATCH_SIZE = 1000;
        const total = payload.length;
        let enviados = 0;
        let erroTotal = null;

        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold"><i class="fas fa-cloud-upload-alt"></i> Iniciando...</span>`;

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = payload.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('producao')
                .insert(chunk);
            
            if (error) {
                erroTotal = error;
                break;
            }
            
            enviados += chunk.length;
            
            if (statusEl) {
                const pct = Math.round((enviados / total) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> Enviando: ${pct}%</span>`;
            }
        }

        if (btn) { btn.disabled = false; }

        if (erroTotal) {
            if(statusEl) statusEl.innerHTML = `<span class="text-red-500 font-bold">Erro!</span>`;
            alert("Erro ao salvar no banco: " + erroTotal.message);
        } else {
            if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Concluído!</span>`;
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 3000);
            alert("Importação concluída com sucesso!");
            if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
                Produtividade.Geral.carregarTela();
            }
        }
    }
};