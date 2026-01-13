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

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            // Detecta se é CSV ou conteúdo separado por ponto e vírgula
            Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8", // Garante acentuação
                complete: (results) => {
                    this.analisarDados(results.data);
                }
            });
        };
        reader.readAsText(file, "UTF-8"); // Força UTF-8 na leitura
        
        // Reseta o input para permitir selecionar o mesmo arquivo novamente se falhar
        input.value = '';
    },

    analisarDados: async function(linhas) {
        this.dadosProcessados = [];
        const container = document.getElementById('tabela-corpo'); // Reusa o grid principal temporariamente ou um modal
        
        // Se quisermos abrir um modal específico, teríamos que ter o HTML do modal. 
        // Vou assumir que vamos jogar na tela principal para validação ou alertar.
        // Para este código, vamos focar na lógica de processamento e salvar direto ou mostrar confirm.
        
        if (linhas.length === 0) return alert("Arquivo vazio.");

        let erros = 0;
        let importaveis = 0;

        // Limpa cache de usuários se necessário
        if (Object.keys(this.mapaUsuarios).length === 0) await this.carregarUsuarios();

        const previewData = [];

        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            
            // Mapeamento das colunas do CSV (Ajuste conforme seu CSV real)
            // Exemplo esperado: Data, Nome, Quantidade, Status, Auditora, ...
            const nomeRaw = row['Nome'] || row['Assistente'] || row['Colaborador'];
            const dataRaw = row['Data'] || row['Data Referencia'];
            const qtdRaw = row['Quantidade'] || row['Qtd'];
            const statusRaw = row['Status'] || row['Classificação'] || 'OK';
            const auditoraRaw = row['Auditora'] || row['Gestora'] || '';
            
            // Colunas opcionais
            const fifo = row['FIFO'] || 0;
            const gTotal = row['Gradual Total'] || 0;
            const gParcial = row['Gradual Parcial'] || 0;
            const perfilFc = row['Perfil FC'] || 0;

            if (!nomeRaw || !dataRaw) continue; // Pula linhas inválidas

            // 1. Valida Usuário
            const nomeNorm = this.normalizarTexto(nomeRaw);
            const usuarioId = this.mapaUsuarios[nomeNorm];
            
            // 2. Normaliza Status
            let status = this.normalizarTexto(statusRaw);
            // Mapeamentos comuns de erro de digitação
            if (status === 'ERRO') status = 'NOK';
            if (status === 'SUCESSO' || status === 'VALIDO') status = 'OK';
            
            // 3. Regra de Neutralidade (Visual para Preview)
            let assertVisual = '<span class="text-slate-400">--</span>';
            let validaClass = "text-slate-600";

            if (status === 'OK') {
                assertVisual = '<span class="text-emerald-600 font-bold">100%</span>';
            } else if (status === 'NOK') {
                assertVisual = '<span class="text-rose-600 font-bold">0%</span>';
            } else if (this.statusNeutros.includes(status)) {
                // É neutro (REV, DUPL, etc). 
                assertVisual = '<span class="text-slate-400 italic">-- (Neutro)</span>';
            } else {
                // Status desconhecido
                assertVisual = '<span class="text-amber-500">?</span>';
            }

            const item = {
                usuario_id: usuarioId,
                nome_original: nomeRaw,
                data_referencia: this.formatarDataBanco(dataRaw), // Converte DD/MM/YYYY para YYYY-MM-DD
                quantidade: parseInt(qtdRaw) || 0,
                status: status,
                auditora: auditoraRaw,
                fifo: parseInt(fifo) || 0,
                gradual_total: parseInt(gTotal) || 0,
                gradual_parcial: parseInt(gParcial) || 0,
                perfil_fc: parseInt(perfilFc) || 0,
                
                // Dados visuais para preview
                valido: !!usuarioId,
                visual_assert: assertVisual
            };

            if (!item.valido) erros++;
            else importaveis++;

            this.dadosProcessados.push(item);
            previewData.push(item);
        }

        // Exibe confirmação simples (ou renderiza modal se o sistema tiver)
        const msg = `Análise do Arquivo:\n\n` +
                    `✅ Prontos para importar: ${importaveis}\n` +
                    `❌ Usuários não encontrados: ${erros}\n\n` +
                    `Deseja prosseguir com a importação?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        }
    },

    formatarDataBanco: function(dataStr) {
        // Aceita DD/MM/YYYY ou YYYY-MM-DD
        if (!dataStr) return null;
        if (dataStr.includes('/')) {
            const parts = dataStr.split('/');
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dataStr; // Assume que já está ISO ou deixa banco validar
    },

    salvarNoBanco: async function() {
        const payload = this.dadosProcessados
            .filter(d => d.valido)
            .map(d => ({
                usuario_id: d.usuario_id,
                data_referencia: d.data_referencia,
                quantidade: d.quantidade,
                status: d.status, // Salva REV, DUPL, OK, NOK como string
                auditora: d.auditora,
                fifo: d.fifo,
                gradual_total: d.gradual_total,
                gradual_parcial: d.gradual_parcial,
                perfil_fc: d.perfil_fc,
                fator: 1 // Default Importação é Fator 1
            }));

        if (payload.length === 0) return alert("Nada para importar.");

        // Feedback visual
        const btn = document.querySelector('button[onclick*="Importar"]');
        const oldTxt = btn ? btn.innerHTML : '';
        if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

        // Batch insert (Supabase limite seguro ~1000 por vez)
        const BATCH_SIZE = 1000;
        let erroTotal = null;

        for (let i = 0; i < payload.length; i += BATCH_SIZE) {
            const chunk = payload.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('producao')
                .insert(chunk);
            
            if (error) {
                erroTotal = error;
                break;
            }
        }

        if (btn) { btn.disabled = false; btn.innerHTML = oldTxt; }

        if (erroTotal) {
            alert("Erro ao salvar no banco: " + erroTotal.message);
        } else {
            alert("Importação concluída com sucesso!");
            // Recarrega a tela atual para mostrar dados novos
            if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
                Produtividade.Geral.carregarTela();
            }
        }
    }
};