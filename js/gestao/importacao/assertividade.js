window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v6.0 - EXCEL NATIVE)
 * ---------------------------------------------------------------------
 * Tecnologia: SheetJS (XLSX)
 * Capacidades:
 * 1. Multi-Aba: Encontra automaticamente a aba de dados no Excel.
 * 2. Blindagem de Formatação: Lê células como valores reais, ignorando aspas/vírgulas.
 * 3. Detecção de Data Híbrida: Suporta ISO (2025-12-06) e BR (06/12/2025).
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarExcel(e.target.files[0]);
            });
        }
    },

    processarExcel: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo Excel...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Abrindo arquivo...</span>';

        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // --- ESTRATÉGIA DE BUSCA DE ABA ---
                // O arquivo pode ter várias abas (Assistentes, Empresas, Dados).
                // Vamos procurar a aba que contém a coluna "end_time".
                let targetSheetName = null;
                let targetRows = null;

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    // Converte para Array de Arrays para inspeção rápida
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
                    
                    if (rows.length > 0) {
                        // Verifica cabeçalhos nas primeiras 5 linhas
                        const preview = rows.slice(0, 5).map(row => row.join(' ').toLowerCase());
                        const temEndTime = preview.some(str => str.includes('end_time') || str.includes('end time'));
                        const temId = preview.some(str => str.includes('id_assistente') || str.includes('id ppc'));

                        if (temEndTime && temId) {
                            targetSheetName = sheetName;
                            targetRows = rows;
                            break;
                        }
                    }
                }

                if (!targetSheetName) {
                    throw new Error("Não foi possível encontrar uma aba com os dados de assertividade (colunas 'end_time' e 'id_assistente' não encontradas).");
                }

                console.log(`[NEXUS] Dados encontrados na aba: ${targetSheetName}`);
                if(statusEl) statusEl.innerHTML = `<span class="text-purple-600">Processando aba: ${targetSheetName}</span>`;

                await this.mapearESalvar(targetRows, statusEl);

            } catch (error) {
                console.error("Erro Excel:", error);
                alert("Erro ao processar Excel: " + error.message);
            } finally {
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                const input = document.getElementById('input-csv-assertividade');
                if(input) input.value = '';
                if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    mapearESalvar: async function(rows, statusEl) {
        if (!rows || rows.length < 2) {
            alert("Aba vazia ou sem cabeçalho.");
            return;
        }

        // 1. Identificar Cabeçalho (Pode não ser a linha 0 se houver título antes)
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const rowStr = rows[i].join(' ').toLowerCase();
            if (rowStr.includes('end_time') || rowStr.includes('end time')) {
                headerRowIndex = i;
                headers = rows[i].map(h => h.toString().trim().toLowerCase());
                break;
            }
        }

        if (headerRowIndex === -1) {
            return alert("Cabeçalho 'end_time' não encontrado nas primeiras 10 linhas.");
        }

        // 2. Mapeamento Dinâmico de Colunas
        const idx = {
            endTime: headers.findIndex(h => h === 'end_time' || h === 'end time' || h === 'data'),
            idAssistente: headers.findIndex(h => h === 'id_assistente' || h === 'id assistente' || h === 'id'),
            // Busca inteligente para 'Assistente' (evita colunas vazias duplicadas)
            assistente: headers.lastIndexOf('assistente'), 
            auditora: headers.findIndex(h => h === 'auditora' || h === 'auditor'),
            docName: headers.findIndex(h => h === 'doc_name' || h === 'documento' || h === 'nome da ppc'),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs') || h.includes('apontamentos')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            numCampos: headers.findIndex(h => h.includes('campos')),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h === 'company_id')
        };

        // Fallback para ID
        if(idx.idAssistente === -1) idx.idAssistente = headers.findIndex(h => h === 'id ppc');

        // 3. Extração e Normalização
        const validos = [];
        const diasEncontrados = new Set();
        let stats = { lidos: 0, ignorados: 0, semData: 0 };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            // --- A. DATA (Coração do sistema) ---
            let rawDate = row[idx.endTime];
            
            // Excel pode retornar número ou string. Como usamos raw:false, vem string.
            if (!rawDate || typeof rawDate !== 'string' || rawDate.trim() === '') {
                stats.semData++;
                continue;
            }
            
            // Tratamento: Remove hora se houver (T ou espaço)
            let dataLiteral = rawDate.split('T')[0].split(' ')[0].trim();
            
            // Conversor de Formato (BR -> ISO)
            // Se vier 06/12/2025 -> vira 2025-12-06
            if (dataLiteral.includes('/')) {
                const parts = dataLiteral.split('/');
                if (parts.length === 3) {
                    // Assume DD/MM/AAAA (Padrão BR)
                    dataLiteral = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            // Validação Final (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) {
                stats.semData++; // Formato irreconhecível
                continue;
            }
            
            diasEncontrados.add(dataLiteral);

            // --- B. ID ---
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(idRaw.toString().replace(/\D/g, '')) : 0;
            if (!idAssistente) {
                stats.ignorados++;
                continue;
            }

            // --- C. Outros Campos ---
            let pctVal = (idx.pct > -1 && row[idx.pct]) ? row[idx.pct].toString().replace('%','').replace(',','.').trim() : '0';
            let pctFinal = isNaN(parseFloat(pctVal)) ? 0 : parseFloat(pctVal).toFixed(2);

            let dtAudit = null;
            if (idx.dataAudit > -1 && row[idx.dataAudit]) {
                let da = row[idx.dataAudit].toString().trim();
                if (da.includes('/')) {
                    const parts = da.split('/');
                    if(parts.length === 3) dtAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (/^\d{4}-\d{2}-\d{2}/.test(da)) {
                    dtAudit = da.substring(0, 10);
                }
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (idx.assistente > -1 ? row[idx.assistente] || '' : '').toString().trim(),
                nome_auditora_raw: (idx.auditora > -1 ? row[idx.auditora] || '' : '').toString().trim(),
                nome_documento: (idx.docName > -1 ? row[idx.docName] || '' : '').toString().trim(),
                status: (idx.status > -1 ? row[idx.status] || '' : '').toString().toUpperCase().trim(),
                observacao: (idx.obs > -1 ? row[idx.obs] || '' : '').toString().trim(),
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: (idx.numCampos > -1) ? (parseInt(row[idx.numCampos]) || 0) : 0,
                porcentagem: pctFinal,
                data_referencia: dataLiteral,
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? row[idx.empresa] || '' : '').toString().trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
            stats.lidos++;
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum dado válido extraído.\n\nStatus:\n- Linhas sem Data/Formato Inválido: ${stats.semData}\n- Linhas sem ID: ${stats.ignorados}`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação (Excel):\n\n` +
                    `📅 Período Detectado: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Válidos: ${dados.length}\n` +
                    `⚠️ Substituição: Dados antigos destas datas serão APAGADOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        // 1. Limpeza
        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias);

        if (errDel) {
            console.error(errDel);
            alert("Erro ao limpar dados: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção
        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Salvando... ${pct}%</span>`;
            }
            
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            
            if (error) {
                alert(`Erro lote ${i}: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Sucesso! ${inseridos} registros importados via Excel.`);
        if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold">Concluído!</span>';
        
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}