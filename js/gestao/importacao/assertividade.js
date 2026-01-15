window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v4.5 - DIAGNOSTIC MODE)
 * -----------------------------------------------------------------------
 * Alterações:
 * 1. Verificação de Cabeçalhos: Avisa se o CSV foi lido errado (ex: ponto e vírgula vs vírgula).
 * 2. Diagnóstico de Falha: Conta exatamente por que as linhas foram ignoradas.
 * 3. Extração Literal: Pega a data (YYYY-MM-DD) direto do texto, ignorando fuso horário.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarArquivo(e.target.files[0]);
            });
        }
    },

    processarArquivo: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Lendo estrutura do arquivo...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8", // Garante leitura correta de acentos
            transformHeader: function(h) {
                // Remove BOM, aspas e normaliza para minúsculo
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                try {
                    console.log("Headers encontrados:", results.meta.fields); // Debug Console
                    await this.filtrarESalvar(results.data, results.meta.fields, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro crítico no processamento: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 8000);
                }
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    filtrarESalvar: async function(linhas, headers, statusEl) {
        // --- 1. VERIFICAÇÃO DE COLUNAS (CRÍTICO) ---
        // Verifica se as colunas essenciais existem. Se não, avisa o usuário.
        const temEndTime = headers.some(h => h.includes('end_time') || h === 'data' || h === 'end time');
        const temId = headers.some(h => h.includes('id_assistente') || h.includes('usuario_id') || h === 'id');

        if (!temEndTime) {
            alert(`⛔ ERRO ESTRUTURAL: Coluna 'end_time' não encontrada.\n\nColunas detectadas: \n${headers.join(', ')}\n\nDica: Verifique se o arquivo está separado por vírgulas.`);
            if(statusEl) statusEl.innerHTML = "Erro: Coluna end_time faltando.";
            return;
        }

        // --- 2. FILTRAGEM ---
        const validos = [];
        const diasEncontrados = new Set();
        
        // Contadores de Diagnóstico (Por que as linhas estão sendo ignoradas?)
        let stats = {
            total: linhas.length,
            semData: 0,
            semId: 0,
            sucesso: 0
        };

        for (const row of linhas) {
            // A. Validação de DATA (end_time)
            // Tenta pegar 'end_time'. Se não achar, tenta fallback para 'data' só por segurança.
            let endTimeRaw = row['end_time'] || row['data'];

            if (!endTimeRaw || typeof endTimeRaw !== 'string' || endTimeRaw.trim() === '') {
                stats.semData++;
                continue;
            }

            // EXTRAÇÃO LITERAL (CORREÇÃO SOLICITADA):
            // Pega os primeiros 10 caracteres (YYYY-MM-DD) direto da string.
            // Ex: "2025-12-06T01:38..." -> "2025-12-06"
            const dataLiteral = endTimeRaw.trim().substring(0, 10);

            // Verifica se parece uma data (Ano-Mes-Dia)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) {
                stats.semData++; // Formato inválido
                continue;
            }

            // B. Validação de ID
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            if (!idRaw) {
                stats.semId++;
                continue;
            }
            
            // Remove tudo que não é número
            const idAssistente = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!idAssistente) {
                stats.semId++;
                continue;
            }

            // C. Sucesso - Adiciona aos dias encontrados
            diasEncontrados.add(dataLiteral);
            stats.sucesso++;

            // D. Métricas (Parse seguro)
            let pctRaw = row['% assert'] || row['assert'] || row['assertividade'] || '0';
            let pctClean = pctRaw.toString().replace('%','').replace(',','.').trim();
            let pctFinal = (pctClean === '' || isNaN(parseFloat(pctClean))) ? 0 : parseFloat(pctClean).toFixed(2);

            let dataAudit = row['data da auditoria'] || null;
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/'); // DD/MM/AAAA -> AAAA-MM-DD
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (row['assistente'] || '').trim(),
                nome_auditora_raw: (row['auditora'] || '').trim(),
                nome_documento: (row['doc_name'] || row['documento'] || '').trim(),
                status: (row['status'] || '').toUpperCase().trim(),
                observacao: (row['apontamentos/obs'] || row['observação'] || '').trim(),
                qtd_ok: parseInt(row['ok'] || 0),
                qtd_nok: parseInt(row['nok'] || 0),
                num_campos: parseInt(row['nº campos'] || 0),
                porcentagem: pctFinal,
                data_referencia: dataLiteral, // A data exata extraída do texto
                data_auditoria: dataAudit,
                empresa_nome: (row['empresa'] || '').trim(),
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        // --- 3. FEEDBACK DE ERRO (Se não trouxe nada) ---
        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            const msgErro = `⚠️ Nenhuma linha válida encontrada!\n\n` +
                            `🔍 Diagnóstico:\n` +
                            `- Total linhas lidas: ${stats.total}\n` +
                            `- Ignoradas (Sem Data/Formato Errado): ${stats.semData}\n` +
                            `- Ignoradas (Sem ID Assistente): ${stats.semId}\n\n` +
                            `Verifique se a coluna 'end_time' contém datas no formato 'AAAA-MM-DD...'`;
            return alert(msgErro);
        }

        // --- 4. CONTINUA PARA O BANCO ---
        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(