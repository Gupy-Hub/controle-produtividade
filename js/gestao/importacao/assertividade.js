window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

    // Função helper para garantir o NULL absoluto
    soTextoOuNull: function(val) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim();
        // Se a string estiver vazia, retorna null literal para o banco
        return str === '' ? null : str;
    },

    // Função helper para números (Percentagem, Campos, etc)
    soNumeroOuNull: function(val) {
        if (val === undefined || val === null) return null;
        const str = String(val).replace('%', '').replace(',', '.').trim();
        if (str === '') return null;
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!linha['Assistente'] && !linha['doc_name']) continue;

            // Tratamento de Data
            let dataLiteral = null;
            const dataAuditRaw = linha['Data da Auditoria ']; 
            if (dataAuditRaw && dataAuditRaw.trim() !== '') {
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 

            listaParaSalvar.push({
                // IDs
                usuario_id: parseInt(linha['id_assistente']) || null,
                
                // Datas
                data_auditoria: dataLiteral, 
                data_referencia: this.soTextoOuNull(linha['end_time']), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,

                // TEXTO: Agora usando soTextoOuNull para evitar strings vazias ""
                empresa: this.soTextoOuNull(linha['Empresa']),
                assistente: this.soTextoOuNull(linha['Assistente']),
                nome_assistente: this.soTextoOuNull(linha['Assistente']),
                
                // CRÍTICO: Se não foi auditado, auditora fica NULL
                auditora: this.soTextoOuNull(linha['Auditora']),
                nome_auditora_raw: this.soTextoOuNull(linha['Auditora']),
                
                doc_name: this.soTextoOuNull(linha['doc_name']),
                status: this.soTextoOuNull(linha['STATUS']), 
                obs: this.soTextoOuNull(linha['Apontamentos/obs']),

                // NDF e Processos
                documento_categoria: this.soTextoOuNull(linha['DOCUMENTO']),
                fila: this.soTextoOuNull(linha['Fila']),
                revalidacao: this.soTextoOuNull(linha['Revalidação']),
                id_ppc: this.soTextoOuNull(linha['ID PPC']),
                nome_ppc: this.soTextoOuNull(linha[' Nome da PPC']), 

                // NÚMEROS: Usando soNumeroOuNull para garantir que vácuo vira NULL
                qtd_validados: this.soNumeroOuNull(linha['Quantidade_documentos_validados']),
                porcentagem: this.soNumeroOuNull(linha['% Assert']),
                num_campos: this.soNumeroOuNull(linha['nº Campos']),
                qtd_ok: this.soNumeroOuNull(linha['Ok']),
                qtd_nok: this.soNumeroOuNull(linha['Nok'])
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
        alert("Importação Concluída com Sucesso!");
    }
};