window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500,
    CONCURRENCY: 1,

    // Limpeza Profunda: Garante NULL absoluto para o banco de dados
    tratarNulo: function(val, isNumeric = false) {
        if (val === undefined || val === null) return null;
        
        // Remove espaços, quebras de linha e caracteres invisíveis
        const str = String(val).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // Se estiver vazio, forçar NULL (isso limpa a Auditora fantasma)
        if (str === "" || str.toLowerCase() === "nan" || str.toLowerCase() === "null") return null;

        if (isNumeric) {
            const num = parseFloat(str.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }
        return str;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            btn.disabled = true;

            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    await this.tratarEEnviar(results.data);
                    input.value = ''; 
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        }
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];
        const cacheIds = new Set();

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const idPpc = this.tratarNulo(linha['ID PPC']);
            if (!idPpc) continue;

            if (cacheIds.has(idPpc)) continue;
            cacheIds.add(idPpc);

            // CORREÇÃO DAS DATAS (01 ao 08): Força o formato ISO puro YYYY-MM-DD
            let dataRef = null;
            const rawEnd = this.tratarNulo(linha['end_time']);
            if (rawEnd) {
                // Pega os primeiros 10 caracteres (YYYY-MM-DD) ignorando horas/fuso
                if (rawEnd.includes('-')) {
                    dataRef = rawEnd.substring(0, 10);
                } else if (rawEnd.includes('/')) { // Caso venha formatada
                    const p = rawEnd.split(' ')[0].split('/');
                    if (p.length === 3) dataRef = `${p[2]}-${p[1]}-${p[0]}`;
                }
            }

            // Data Auditoria
            let dataAuditoria = null;
            const rawAudit = this.tratarNulo(linha['Data da Auditoria ']);
            if (rawAudit && rawAudit.includes('/')) {
                const p = rawAudit.split('/');
                dataAuditoria = `${p[2]}-${p[1]}-${p[0]}`;
            }

            listaParaSalvar.push({
                id_ppc: idPpc,
                data_referencia: dataRef,
                data_auditoria: dataAuditoria,
                end_time: rawEnd,
                
                // Texto (Se vazio no CSV, será NULL no banco)
                auditora: this.tratarNulo(linha['Auditora']),
                nome_auditora_raw: this.tratarNulo(linha['Auditora']),
                assistente: this.tratarNulo(linha['Assistente']),
                nome_assistente: this.tratarNulo(linha['Assistente']),
                doc_name: this.tratarNulo(linha['doc_name']),
                status: this.tratarNulo(linha['STATUS']),
                empresa: this.tratarNulo(linha['Empresa']),
                empresa_id: this.tratarNulo(linha['Company_id']),
                obs: this.tratarNulo(linha['Apontamentos/obs']),
                observacao: this.tratarNulo(linha['Apontamentos/obs']),

                // Números (Se vazio no CSV, será NULL no banco)
                num_campos: this.tratarNulo(linha['nº Campos'], true),
                campos: this.tratarNulo(linha['nº Campos'], true),
                ok: this.tratarNulo(linha['Ok'], true),
                qtd_ok: this.tratarNulo(linha['Ok'], true),
                nok: this.tratarNulo(linha['Nok'], true),
                qtd_nok: this.tratarNulo(linha['Nok'], true),
                porcentagem: this.tratarNulo(linha['% Assert'], true),
                qtd_validados: this.tratarNulo(linha['Quantidade_documentos_validados'], true)
            });
        }
        await this.enviarLotes(listaParaSalvar);
    },

    enviarLotes: async function(dados) {
        for (let i = 0; i < dados.length; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) console.error("Erro:", error.message);
        }
        alert("Importação Concluída!");
    }
};