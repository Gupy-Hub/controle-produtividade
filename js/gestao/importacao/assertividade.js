window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
                btn.disabled = true;
            }

            setTimeout(() => {
                this.lerCSV(file).finally(() => {
                    input.value = ''; 
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                });
            }, 50);
        }
    },

    lerCSV: function(file) {
        return new Promise((resolve) => {
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];
        
        const limpar = (val) => (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : null;
        
        // FUNÇÃO REFORMULADA: Se não tiver valor real, retorna NULL absoluto
        const soNumeroOuNull = (val) => {
            if (val === undefined || val === null) return null;
            const str = String(val).replace('%', '').replace(',', '.').trim();
            if (str === '') return null; // Vazio vira NULL
            const num = parseFloat(str);
            return isNaN(num) ? null : num; // Se não for número, vira NULL
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!linha['Assistente'] && !linha['doc_name']) continue;

            let dataLiteral = null;
            const dataAuditRaw = linha['Data da Auditoria ']; 
            if (dataAuditRaw) {
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 

            listaParaSalvar.push({
                usuario_id: parseInt(linha['id_assistente']) || null, 
                company_id: limpar(linha['Company_id']), 
                empresa_id: parseInt(linha['Company_id']) || null,
                data_auditoria: dataLiteral, 
                data_referencia: linha['end_time'] || new Date().toISOString(), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,
                created_at: new Date().toISOString(),
                empresa: limpar(linha['Empresa']),
                assistente: limpar(linha['Assistente']),
                nome_assistente: limpar(linha['Assistente']),
                auditora: limpar(linha['Auditora']),
                doc_name: limpar(linha['doc_name']),
                status: limpar(linha['STATUS']), 
                obs: limpar(linha['Apontamentos/obs']),
                documento_categoria: limpar(linha['DOCUMENTO']),
                nome_documento: limpar(linha['DOCUMENTO']),      
                fila: limpar(linha['Fila']),
                revalidacao: limpar(linha['Revalidação']),
                id_ppc: limpar(linha['ID PPC']),
                nome_ppc: limpar(linha[' Nome da PPC']), 
                schema_id: limpar(linha['Schema_id']),

                // APLICANDO A REGRA RIGOROSA DE NULO
                qtd_validados: soNumeroOuNull(linha['Quantidade_documentos_validados']),
                porcentagem: soNumeroOuNull(linha['% Assert']), // Se estiver vazio no CSV, vai NULL para o banco
                num_campos: soNumeroOuNull(linha['nº Campos']),
                campos: soNumeroOuNull(linha['nº Campos']),
                qtd_ok: soNumeroOuNull(linha['Ok']),
                ok: soNumeroOuNull(linha['Ok']),
                qtd_nok: soNumeroOuNull(linha['Nok']),
                nok: soNumeroOuNull(linha['Nok'])
            });
        }

        if (listaParaSalvar.length > 0) {
            await this.enviarLotesConcorrentes(listaParaSalvar);
        }
    },

    enviarLotesConcorrentes: async function(dados) {
        const total = dados.length;
        let processados = 0;
        const lotes = [];
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            lotes.push(dados.slice(i, i + this.BATCH_SIZE));
        }

        const processarLote = async (lote) => {
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { 
                    onConflict: 'assistente,data_referencia,doc_name,status',
                    ignoreDuplicates: false 
                });

            if (error) console.error("Erro no lote:", error.message);
            else processados += lote.length;
        };

        for (let i = 0; i < lotes.length; i += this.CONCURRENCY) {
            const grupoAtual = lotes.slice(i, i + this.CONCURRENCY);
            await Promise.all(grupoAtual.map(lote => processarLote(lote)));
        }
        alert("Importação Finalizada!");
    }
};