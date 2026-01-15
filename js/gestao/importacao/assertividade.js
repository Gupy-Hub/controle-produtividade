window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (REWRITE v11.0 - STRICT MODE)
 * ---------------------------------------------------------------------
 * Regra Ouro: A data é definida EXCLUSIVAMENTE pela coluna 'end_time'.
 * Lógica:
 * 1. Lê 'end_time' como string.
 * 2. Se vazio -> Descarta a linha.
 * 3. Se formato ISO/BR/Misto -> Força conversão para YYYY-MM-DD via texto.
 * 4. Salva via RPC segura (mantendo a segurança implementada anteriormente).
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        // Reinicializa o input para garantir limpeza de eventos antigos
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarCSV(e.target.files[0]);
            });
        }
    },

    // --- O CORAÇÃO DA NOVA LÓGICA ---
    // Transforma qualquer data válida em YYYY-MM-DD sem usar 'new Date()' para evitar fuso.
    extrairDataSegura: function(valorRaw) {
        if (!valorRaw || typeof valorRaw !== 'string') return null;
        
        const str = valorRaw.trim();
        if (str === '') return null;

        let ano, mes, dia;

        // CASO 1: Formato ISO (ex: 2025-12-01T14:00... ou 2025-12-1)
        if (str.includes('-')) {
            const partes = str.split('T')[0].split('-'); // Pega só a parte da data antes do T
            if (partes.length >= 3) {
                ano = partes[0];
                mes = partes[1];
                dia = partes[2];
            }
        } 
        // CASO 2: Formato BR/Excel (ex: 01/12/2025 ou 1/12/2025)
        else if (str.includes('/')) {
            const partes = str.split('/');
            if (partes.length >= 3) {
                dia = partes[0];
                mes = partes[1];
                ano = partes[2];
                // Remove hora se houver (ex: 2025 12:00)
                if (ano.includes(' ')) ano = ano.split(' ')[0]; 
            }
        }

        // Validação e Padronização (Adiciona zeros à esquerda se faltar: 1 -> 01)
        if (ano && mes && dia) {
            if (ano.length === 2) ano = '20' + ano; // 25 -> 2025
            if (mes.length === 1) mes = '0' + mes;
            if (dia.length === 1) dia = '0' + dia;

            const dataFinal = `${ano}-${mes}-${dia}`;
            
            // Regex final para garantir que saiu YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dataFinal)) {
                return dataFinal;
            }
        }

        return null; // Se falhar, retorna nulo para a linha ser descartada
    },

    processarCSV: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Analisando end_time...</span>';

        Papa.parse(file, {
            header: false, 
            skipEmptyLines: 'greedy', // Remove linhas totalmente vazias automaticamente
            escapeChar: '\\', 
            encoding: "UTF-8",
            complete: async (results) => {
                try {
                    await this.filtrarESalvar(results.data, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro crítico: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
                }
            },
            error: (err) => {
                alert("Erro leitura CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    filtrarESalvar: async function(rows, statusEl) {
        if (!rows || rows.length < 2) {
            return alert("Arquivo vazio ou inválido.");
        }

        // 1. Mapeamento de Colunas (Normalização)
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/"/g, ''));
        
        const idx = {
            endTime: headers.findIndex(h => h.includes('end_time')), // Foco Total aqui
            
            // IDs e Usuários
            idAssistente: headers.indexOf('id_assistente') !== -1 
                ? headers.indexOf('id_assistente') 
                : headers.findIndex(h => h.includes('id_assistente') || h === 'id' || h.includes('id ppc')),
            assistente: headers.lastIndexOf('assistente'),
            
            // Dados da Auditoria
            auditora: headers.findIndex(h => h.includes('auditor') && !h.includes('data')),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            
            // Metadados
            docName: headers.findIndex(h => h.includes('doc_name') || h.includes('documento')),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs') || h.includes('apontamentos')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h.includes('company')),
            campos: headers.findIndex(h => h.includes('campos') || h.includes('nº campos'))
        };

        // Validação Estrita: Se não tiver end_time, nem tenta continuar.
        if (idx.endTime === -1) return alert("ERRO: Coluna 'end_time' não encontrada. O sistema exige esta coluna.");

        const dadosValidos = [];
        const diasEncontrados = new Set();
        let stats = { total: 0, ignoradosSemData: 0, ignoradosSemID: 0 };

        // 2. Loop de Processamento (Pula cabeçalho)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            stats.total++;

            // A. Extração da Data Principal (End Time)
            const dataString = this.extrairDataSegura(row[idx.endTime]);
            
            // REGRA: Se não conseguiu extrair a data do end_time, exclui a linha.
            if (!dataString) {
                stats.ignoradosSemData++;
                continue; 
            }
            diasEncontrados.add(dataString);

            // B. ID do Assistente
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(String(idRaw).replace(/\D/g, '')) : 0;
            if (!idAssistente) {
                stats.ignoradosSemID++;
                continue;
            }

            // C. Tratamento de Outros Campos
            let pctFinal = 0;
            if (idx.pct > -1 && row[idx.pct]) {
                let p = String(row[idx.pct]).replace('%','').replace(',','.').trim();
                pctFinal = isNaN(parseFloat(p)) ? 0 : parseFloat(p).toFixed(2);
            }

            // Data Auditoria (Opcional, mas formatada se existir)
            let dtAudit = idx.dataAudit > -1 ? this.extrairDataSegura(row[idx.dataAudit]) : null;

            // Nº Campos
            let numCampos = (idx.campos > -1 && row[idx.campos]) ? (parseInt(row[idx.campos]) || 0) : 0;

            dadosValidos.push({
                usuario_id: idAssistente,
                nome_assistente: (idx.assistente > -1 ? String(row[idx.assistente]||'') : '').trim(),
                nome_auditora_raw: (idx.auditora > -1 ? String(row[idx.auditora]||'') : '').trim(),
                nome_documento: (idx.docName > -1 ? String(row[idx.docName]||'') : '').trim(),
                status: (idx.status > -1 ? String(row[idx.status]||'') : '').toUpperCase().trim(),
                observacao: (idx.obs > -1 ? String(row[idx.obs]||'') : '').trim(),
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: numCampos,
                porcentagem: pctFinal,
                data_referencia: dataString, // Data limpa e garantida
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? String(row[idx.empresa]||'') : '').trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
        }

        if (dadosValidos.length === 0) {
            return alert(`Nenhum registro válido.\n\nIgnorados sem Data (end_time): ${stats.ignoradosSemData}\nIgnorados sem ID: ${stats.ignoradosSemID}`);
        }

        await this.enviarParaBanco(dadosValidos, Array.from(diasEncontrados), statusEl);
    },

    enviarParaBanco: async function(dados, dias, statusEl) {
        dias.sort();
        // Formatação visual da data para o alert (DD/MM/YYYY)
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Confirmação de Importação:\n\n` +
                    `📅 Dias Detectados via 'end_time':\n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Válidos: ${dados.length}\n` +
                    `🗑️ Linhas Excluídas (Vazias/Sem Data): ${dados.length < 100000 ? 'Calculado no passo anterior' : 'Várias'}\n\n` +
                    `Confirmar substituição segura?`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Operação cancelada.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        // 1. Limpeza Segura (RPC)
        const { error: errDel } = await Sistema.supabase
            .rpc('limpar_assertividade_dias', { dias: dias });

        if (errDel) {
            alert("Erro ao limpar: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção Segura (RPC)
        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Enviando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase
                .rpc('importar_assertividade_lote', { dados: lote });

            if (error) {
                console.error(error);
                alert(`Erro no lote ${i}: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Importação Concluída!\n\n${inseridos} registros inseridos com sucesso.`);
        if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold">Sucesso Total!</span>';
        
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    }
};

// Auto-inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}