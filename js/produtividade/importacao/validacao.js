Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    mapaUsuariosPorNome: null,
    mapaUsuariosPorId: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btnTextoOriginal = input.nextElementSibling ? input.nextElementSibling.innerHTML : "Importar";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

        try {
            await this.carregarMapaUsuarios();

            let arquivosSucesso = 0;
            let totalRegistrosImportados = 0;
            let relatorioIgnorados = []; 
            let errosCriticos = [];

            // Processa arquivo por arquivo
            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                try {
                    const resultado = await this.processarArquivoIndividual(arquivo);
                    arquivosSucesso++;
                    totalRegistrosImportados += resultado.importados;
                    
                    if (resultado.ignorados && resultado.ignorados.length > 0) {
                        resultado.ignorados.forEach(item => {
                            relatorioIgnorados.push(`${item.nome} (ID: ${item.id})`);
                        });
                    }
                } catch (err) {
                    console.error(`Erro no arquivo ${arquivo.name}:`, err);
                    errosCriticos.push(`${arquivo.name}: ${err.message}`);
                }
            }

            this.exibirModalRelatorio(arquivosSucesso, totalRegistrosImportados, relatorioIgnorados, errosCriticos);

            // Atualiza a tela se estiver na aba Geral
            if(Produtividade.Geral) Produtividade.Geral.carregarTela();

        } catch (erroGeral) {
            console.error(erroGeral);
            alert("Erro crítico: " + erroGeral.message);
        } finally {
            input.value = ""; 
            if(input.nextElementSibling) input.nextElementSibling.innerHTML = btnTextoOriginal;
        }
    },

    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    carregarMapaUsuarios: async function() {
        const { data, error } = await Sistema.supabase.from('usuarios').select('id, nome');
        if (error) throw error;

        this.mapaUsuariosPorNome = {};
        this.mapaUsuariosPorId = {};
        
        data.forEach(u => {
            this.mapaUsuariosPorId[u.id] = u.id; 
            if(u.nome) {
                const chave = this.normalizarTexto(u.nome);
                this.mapaUsuariosPorNome[chave] = u.id;
            }
        });
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            // PapaParse lê o arquivo
            Papa.parse(arquivo, {
                header: true,
                skipEmptyLines: true, 
                encoding: "UTF-8",
                transformHeader: function(h) { return h.trim(); }, // Remove espaços dos cabeçalhos
                complete: async (results) => {
                    try {
                        // O segredo está aqui: processar os dados E descobrir a data
                        const resultadoBanco = await this.salvarDadosBanco(results.data);
                        resolve(resultadoBanco); 
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    salvarDadosBanco: async function(linhas) {
        // Agrupa linhas por DATA (pois um arquivo pode ter vários dias, ou o nome do arquivo não importar)
        const payloadPorData = {}; 
        const ignoradosNesteArquivo = [];

        for (const row of linhas) {
            // 1. Validação Básica de Linha
            // Verifica colunas comuns do seu CSV
            if (!row['Assistente'] && !row['id_assistente']) continue;
            
            const nomeCsv = row['Assistente'] || 'Desconhecido';
            // Ignora linhas de totalização do Excel
            if (nomeCsv.toLowerCase() === 'total' || nomeCsv.toLowerCase() === 'média') continue;

            // 2. Identificação do Usuário
            const idCsv = row['id_assistente'] ? parseInt(row['id_assistente'].replace(/\D/g,'')) : null;
            let usuarioIdEncontrado = null;

            if (idCsv && this.mapaUsuariosPorId[idCsv]) {
                usuarioIdEncontrado = this.mapaUsuariosPorId[idCsv];
            } else {
                const nomeNormalizado = this.normalizarTexto(nomeCsv);
                if (this.mapaUsuariosPorNome[nomeNormalizado]) {
                    usuarioIdEncontrado = this.mapaUsuariosPorNome[nomeNormalizado];
                }
            }

            if (!usuarioIdEncontrado) {
                ignoradosNesteArquivo.push({ nome: nomeCsv, id: idCsv || 'S/ ID' });
                continue; 
            }

            // 3. Identificação da Data (Inteligente)
            let dataRef = null;
            // Tenta Data da Auditoria primeiro
            let rawData = row['Data da Auditoria'] || row['Data'] || row['end_time'];
            
            if (rawData) {
                if (rawData.includes('T')) { // Formato ISO do end_time
                    dataRef = rawData.split('T')[0];
                } else if (rawData.includes('/')) { // Formato BR
                    const partes = rawData.split('/');
                    if(partes.length === 3) dataRef = `${partes[2]}-${partes[1]}-${partes[0]}`;
                } else if (rawData.includes('-')) {
                    dataRef = rawData;
                }
            }

            if (!dataRef) continue; // Sem data, não tem como salvar produção diária

            // 4. Extração de Valores Numéricos
            const limparNum = (val) => val ? (parseInt(String(val).replace(/\./g, '')) || 0) : 0;
            
            // Mapeamento correto das colunas do seu CSV Dezembo.csv
            const qtd = limparNum(row['Quantidade_documentos_validados'] || row['quantidade']);
            const fifo = limparNum(row['Fila'] === 'FIFO' ? qtd : 0); // Exemplo de lógica, ajuste conforme sua coluna real de FIFO
            
            // Se não tivermos colunas explícitas de gradual/parcial no CSV, assumimos 0 ou lógica customizada
            // No seu CSV 'Dezembro.csv', não vi colunas explícitas 'gradual_total'. 
            // Vamos focar na Quantidade Principal.
            
            const obj = {
                usuario_id: usuarioIdEncontrado,
                data_referencia: dataRef,
                quantidade: qtd,
                fifo: fifo,
                gradual_total: 0, // Ajustar se tiver a coluna no CSV
                gradual_parcial: 0,
                perfil_fc: 0,
                fator: 1 // Começa com 100%
            };

            if (!payloadPorData[dataRef]) payloadPorData[dataRef] = [];
            payloadPorData[dataRef].push(obj);
        }

        let totalImportados = 0;

        // Salva no banco dia por dia (para evitar limpar o mês todo se importar só um dia)
        for (const dataKey in payloadPorData) {
            const listaDia = payloadPorData[dataKey];
            if (listaDia.length === 0) continue;

            // Remove dados anteriores DESSE DIA ESPECÍFICO para evitar duplicação
            const { error: errDel } = await Sistema.supabase
                .from('producao')
                .delete()
                .eq('data_referencia', dataKey);
            
            if (errDel) throw new Error(`Erro ao limpar dia ${dataKey}: ${errDel.message}`);

            // Insere novos
            const { error: errIns } = await Sistema.supabase
                .from('producao')
                .insert(listaDia);
            
            if (errIns) throw new Error(`Erro ao salvar dia ${dataKey}: ${errIns.message}`);
            
            totalImportados += listaDia.length;
        }

        return { importados: totalImportados, ignorados: ignoradosNesteArquivo };
    },

    exibirModalRelatorio: function(sucesso, totalReg, ignorados, errosCriticos) {
        const modalAntigo = document.getElementById('modal-importacao-resultado');
        if(modalAntigo) modalAntigo.remove();

        const temIgnorados = ignorados.length > 0;
        const temErros = errosCriticos.length > 0;

        const html = `
        <div id="modal-importacao-resultado" class="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-slate-800"><i class="fas fa-file-import mr-2"></i> Resultado da Importação</h3>
                    <button onclick="document.getElementById('modal-importacao-resultado').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-center">
                            <span class="block text-2xl font-black text-emerald-600">${sucesso}</span>
                            <span class="text-xs font-bold text-emerald-800 uppercase">Arquivos</span>
                        </div>
                        <div class="bg-blue-50 border border-blue-100 p-3 rounded-lg text-center">
                            <span class="block text-2xl font-black text-blue-600">${totalReg}</span>
                            <span class="text-xs font-bold text-blue-800 uppercase">Registros</span>
                        </div>
                    </div>
                    ${temIgnorados ? `
                    <div class="border border-amber-200 bg-amber-50 rounded-lg p-4">
                        <h4 class="text-sm font-bold text-amber-800 mb-2"><i class="fas fa-exclamation-triangle"></i> Usuários Não Encontrados (${ignorados.length})</h4>
                        <textarea class="w-full h-24 text-xs bg-white border border-amber-200 rounded p-2 text-slate-600 font-mono outline-none resize-none" readonly>${ignorados.join('\n')}</textarea>
                    </div>` : ''}
                    ${temErros ? `
                    <div class="border border-red-200 bg-red-50 rounded-lg p-4">
                        <h4 class="text-sm font-bold text-red-800 mb-2"><i class="fas fa-bug"></i> Erros Críticos</h4>
                        <ul class="list-disc list-inside text-xs text-red-700 font-mono">${errosCriticos.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>` : ''}
                </div>
                <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                    <button onclick="document.getElementById('modal-importacao-resultado').remove()" class="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-md transition">Fechar</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    limparBancoCompleto: async function() {
        if (!confirm("⚠️ ATENÇÃO: Isso apagará TODOS os dados de produção.\nDeseja continuar?")) return;
        
        // Chamada direta para limpar tabela (requer permissão no Supabase)
        const { error } = await Sistema.supabase.from('producao').delete().neq('id', 0);
        
        if (error) {
            alert("Erro ao limpar banco: " + error.message);
        } else {
            alert("Banco limpo com sucesso!");
            if(Produtividade.Geral) Produtividade.Geral.carregarTela();
        }
    }
};