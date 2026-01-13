Produtividade = window.Produtividade || {};
Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    mapaUsuarios: {}, // Cache de Nome -> ID
    statusNeutros: ['REV', 'DUPL', 'EMPR', 'IA', 'NA'], // Status que não tem nota

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
        // Normaliza nomes para facilitar o "match" (remove acentos, uppercase)
        data.forEach(u => {
            const nomeNorm = this.normalizarTexto(u.nome);
            this.mapaUsuarios[nomeNorm] = u.id;
        });
    },

    normalizarTexto: function(txt) {
        if (!txt) return "";
        return txt.toString().trim().toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); // Remove acentos
    },

    processar: function(input) {
        const file = input.files[0];
        if (!file) return;

        // Feedback Visual: Lendo
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo CSV...</span>`;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            // Detecta se é CSV ou conteúdo separado por ponto e vírgula
            Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8", 
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

        // Feedback Visual: Analisando
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-cog fa-spin"></i> Analisando...</span>`;
        
        // Pequeno delay para a UI atualizar antes de travar no loop
        await new Promise(r => setTimeout(r, 50));

        let erros = 0;
        let importaveis = 0;

        if (Object.keys(this.mapaUsuarios).length === 0) await this.carregarUsuarios();

        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            
            const nomeRaw = row['Nome'] || row['Assistente'] || row['Colaborador'];
            const dataRaw = row['Data'] || row['Data Referencia'];
            const qtdRaw = row['Quantidade'] || row['Qtd'];
            const statusRaw = row['Status'] || row['Classificação'] || 'OK';
            const auditoraRaw = row['Auditora'] || row['Gestora'] || '';
            
            const fifo = row['FIFO'] || 0;
            const gTotal = row['Gradual Total'] || 0;
            const gParcial = row['Gradual Parcial'] || 0;
            const perfilFc = row['Perfil FC'] || 0;

            if (!nomeRaw || !dataRaw) continue; 

            // 1. Valida Usuário
            const nomeNorm = this.normalizarTexto(nomeRaw);
            const usuarioId = this.mapaUsuarios[nomeNorm];
            
            // 2. Normaliza Status
            let status = this.normalizarTexto(statusRaw);
            if (status === 'ERRO') status = 'NOK';
            if (status === 'SUCESSO' || status === 'VALIDO') status = 'OK';
            
            // 3. Regra de Neutralidade
            let assertVisual = '<span class="text-slate-400">--</span>';

            if (status === 'OK') {
                assertVisual = '<span class="text-emerald-600 font-bold">100%</span>';
            } else if (status === 'NOK') {
                assertVisual = '<span class="text-rose-600 font-bold">0%</span>';
            } else if (this.statusNeutros.includes(status)) {
                assertVisual = '<span class="text-slate-400 italic">-- (Neutro)</span>';
            } else {
                assertVisual = '<span class="text-amber-500">?</span>';
            }

            const item = {
                usuario_id: usuarioId,
                nome_original: nomeRaw,
                data_referencia: this.formatarDataBanco(dataRaw), 
                quantidade: parseInt(qtdRaw) || 0,
                status: status,
                auditora: auditoraRaw,
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

        if(statusEl) statusEl.innerHTML = ""; // Limpa status temporário para mostrar confirm

        const msg = `Análise do Arquivo:\n\n` +
                    `✅ Prontos para importar: ${importaveis}\n` +
                    `❌ Usuários não encontrados: ${erros}\n\n` +
                    `Deseja prosseguir com a importação?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        } else {
            if(statusEl) statusEl.innerHTML = "";
        }
    },

    formatarDataBanco: function(dataStr) {
        if (!dataStr) return null;
        if (dataStr.includes('/')) {
            const parts = dataStr.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dataStr;
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        const btn = document.querySelector('button[onclick*="Importar"]');
        const oldTxt = btn ? btn.innerHTML : '';
        
        if(btn) { btn.disabled = true; } // Apenas desabilita o botão, o texto vai na div

        const payload = this.dadosProcessados
            .filter(d => d.valido)
            .map(d => ({
                usuario_id: d.usuario_id,
                data_referencia: d.data_referencia,
                quantidade: d.quantidade,
                status: d.status, 
                auditora: d.auditora,
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

        // Feedback Inicial
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
            
            // Atualiza porcentagem na UI
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
            
            // Remove a mensagem de "Concluído" após 3 segundos
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 3000);

            alert("Importação concluída com sucesso!");
            if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
                Produtividade.Geral.carregarTela();
            }
        }
    }
};