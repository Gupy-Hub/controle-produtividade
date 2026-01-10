// Namespace específico para Importação de Validação
Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    processar: async function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        // 1. Extrair DATA do Nome do Arquivo (ddmmaaaa)
        // Ex: 01122025.csv -> 01/12/2025
        const nomeLimpo = arquivo.name.split('.')[0]; // Remove .csv ou .xlsx
        const regexData = /^(\d{2})(\d{2})(\d{4})$/;
        const match = nomeLimpo.match(regexData);

        if (!match) {
            alert("Erro: O nome do arquivo deve estar no formato ddmmaaaa (Ex: 01122025.csv)");
            input.value = "";
            return;
        }

        const dia = match[1];
        const mes = match[2];
        const ano = match[3];
        const dataReferencia = `${ano}-${mes}-${dia}`; // Formato ISO para o banco (YYYY-MM-DD)

        // Feedback Visual
        const btnTextoOriginal = input.nextElementSibling ? input.nextElementSibling.innerHTML : "Importar";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        // 2. Ler o Arquivo (PapaParse para CSV)
        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                await this.salvarDados(results.data, dataReferencia, input, btnTextoOriginal);
            },
            error: (err) => {
                console.error("Erro ao ler CSV:", err);
                alert("Erro ao ler o arquivo CSV.");
                this.resetarBotao(input, btnTextoOriginal);
            }
        });
    },

    salvarDados: async function(linhas, dataRef, inputElement, btnTextoOriginal) {
        try {
            const insertsProducao = [];
            const usuariosParaAtualizar = []; // Se quisermos criar usuários que não existem (opcional)

            // Vamos percorrer linha a linha do CSV
            for (const row of linhas) {
                // Pular linha de "Total" ou linhas vazias
                if (!row.id_assistente || row.id_assistente.toString().toLowerCase() === 'total' || !row.assistente) {
                    continue;
                }

                // Mapeamento das colunas do CSV para o Banco de Dados
                const idExterno = row.id_assistente;
                const nome = row.assistente;
                
                // Sanitização de números (troca vírgula por ponto se necessário e converte para Int)
                const getNumber = (val) => val ? parseInt(String(val).replace('.', '')) : 0; // Assume que não tem decimal, se tiver use parseFloat e replace adequado

                const qtd = getNumber(row.documentos_validados); // Coluna G
                const fifo = getNumber(row.documentos_validados_fifo); // Coluna C
                const gTotal = getNumber(row.documentos_validados_gradual_total); // Coluna D
                const gParcial = getNumber(row.documentos_validados_gradual_parcial); // Coluna E
                const perfilFc = getNumber(row.documentos_validados_perfil_fc); // Coluna F

                // AQUI TEMOS UM DESAFIO: 
                // Precisamos saber o ID interno do usuário no Supabase.
                // Vou assumir que vamos buscar pelo ID externo ou Nome.
                // Para simplificar e ser performático, vamos tentar buscar o usuário antes.
                
                // Adiciona na lista de produção
                insertsProducao.push({
                    data_referencia: dataRef,
                    id_externo: idExterno, // Usaremos isso para achar o usuario real
                    nome_temp: nome,       // Backup caso precise criar
                    quantidade: qtd,
                    fifo: fifo,
                    gradual_total: gTotal,
                    gradual_parcial: gParcial,
                    perfil_fc: perfilFc,
                    fator: 1 // Padrão 100%
                });
            }

            if (insertsProducao.length === 0) {
                alert("Nenhum dado válido encontrado na planilha.");
                this.resetarBotao(inputElement, btnTextoOriginal);
                return;
            }

            // 3. Processamento no Banco de Dados
            // Para garantir integridade, primeiro garantimos que os usuários existem
            // Vou fazer uma lógica otimizada: Buscar todos usuarios e mapear.

            const { data: usersDb, error: errUsers } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');
            
            if(errUsers) throw errUsers;

            // Cria mapa para busca rápida: "Nome do Assistente" -> ID
            const mapaUsuarios = {};
            usersDb.forEach(u => mapaUsuarios[u.nome.trim().toLowerCase()] = u.id);

            const payloadFinal = [];

            for (const item of insertsProducao) {
                let userId = mapaUsuarios[item.nome_temp.trim().toLowerCase()];

                // Se usuário não existe, teríamos que criar. 
                // Por segurança, vamos pular ou alertar. 
                // Assumindo que o usuário JÁ FOI CADASTRADO na Gestão > Usuários.
                if (userId) {
                    payloadFinal.push({
                        usuario_id: userId,
                        data_referencia: item.data_referencia,
                        quantidade: item.quantidade,
                        fifo: item.fifo,
                        gradual_total: item.gradual_total,
                        gradual_parcial: item.gradual_parcial,
                        perfil_fc: item.perfil_fc,
                        fator: 1
                    });
                } else {
                    console.warn(`Usuário não encontrado no banco: ${item.nome_temp} (ID CSV: ${item.id_externo}). Ignorando registro.`);
                }
            }

            if (payloadFinal.length === 0) {
                alert("Erro: Nenhum usuário da planilha foi encontrado no banco de dados. Verifique se os nomes correspondem.");
                this.resetarBotao(inputElement, btnTextoOriginal);
                return;
            }

            // 4. Upsert (Inserir ou Atualizar) na tabela 'producao'
            // Identificador único para update: usuario_id + data_referencia
            // Precisamos garantir que existe uma constraint unique(usuario_id, data_referencia) no banco
            
            // Removemos registros anteriores desse dia para evitar duplicidade de soma se importar 2x
            const { error: errDel } = await Sistema.supabase
                .from('producao')
                .delete()
                .eq('data_referencia', dataRef);
                
            if(errDel && errDel.code !== 'PGRST100') throw errDel; // Ignora se não achar nada

            const { error: errInsert } = await Sistema.supabase
                .from('producao')
                .insert(payloadFinal);

            if (errInsert) throw errInsert;

            alert(`Importação concluída com sucesso para o dia ${dataRef.split('-').reverse().join('/')}!\n${payloadFinal.length} registros processados.`);
            
            // Atualiza a tela global
            if(Produtividade.Geral) {
                document.getElementById('global-date').value = dataRef;
                Produtividade.Geral.carregarTela();
            }

        } catch (error) {
            console.error(error);
            alert("Erro crítico na importação: " + error.message);
        } finally {
            this.resetarBotao(inputElement, btnTextoOriginal);
        }
    },

    resetarBotao: function(input, texto) {
        input.value = "";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = texto;
    }
};